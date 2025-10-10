// routes/api/rooms.js - User rooms API (own data only)
const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabase = require('../../config/supabase');
const path = require('path');
const { requireAuth, requireRoomOwnershipOrAdmin } = require('../../middleware/requireAuth');

// Multer setup
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    cb(file.mimetype.startsWith('image/') ? null : new Error('Only image files are allowed'), true);
  }
});

// Helper function to validate room request data
const validateRoomRequestData = (data) => {
  const errors = [];

  if (!data.message || !data.message.trim()) {
    errors.push('Message is required');
  } else if (data.message.trim().length < 10) {
    errors.push('Message must be at least 10 characters long');
  } else if (data.message.trim().length > 1000) {
    errors.push('Message must be less than 1000 characters');
  }

  if (!data.contactMethod || !data.contactMethod.trim()) {
    errors.push('Contact method is required');
  } else if (data.contactMethod.trim().length > 500) {
    errors.push('Contact method must be less than 500 characters');
  }

  if (!data.moveInDate) {
    errors.push('Preferred move-in date is required');
  } else {
    const moveIn = new Date(data.moveInDate);
    if (isNaN(moveIn.getTime()) || moveIn < new Date().setHours(0,0,0,0)) {
      errors.push('Move-in date cannot be in the past');
    }
  }

  if (data.occupants && (!Number.isInteger(data.occupants) || data.occupants < 1 || data.occupants > 20)) {
    errors.push('Occupants must be a number between 1 and 20');
  }

  if (data.stayDuration && data.stayDuration.trim().length > 100) {
    errors.push('Stay duration must be less than 100 characters');
  }

  return errors;
};

// Validation middleware
const validateRoomData = (req, res, next) => {
  const { title, description, rent, location, beds, move_in_date, contact_info } = req.body;
  const errors = [];
  const isUpdate = req.method === 'PUT'; // Check if this is an update request

  console.log(`🔍 Validating room data (${isUpdate ? 'UPDATE' : 'CREATE'}):`, {
    title: title ? 'provided' : 'missing',
    rent: rent ? 'provided' : 'missing',
    location: location ? 'provided' : 'missing',
    beds: beds ? 'provided' : 'missing',
    move_in_date: move_in_date ? 'provided' : 'missing',
    contact_info: contact_info ? 'provided' : 'missing'
  });

  // Parse contact_info
  let parsedContact = {};
  if (contact_info) {
    try {
      parsedContact = typeof contact_info === 'string' ? JSON.parse(contact_info) : contact_info || {};
    } catch {
      return res.status(400).json({ error: 'Invalid contact_info format' });
    }
  }

  // For CREATE operations, all fields are required
  // For UPDATE operations, only validate provided fields
  if (!isUpdate || title !== undefined) {
    if (!title?.trim()) errors.push('Title is required');
  }
  
  if (description && description.length > 1000) {
    errors.push('Description cannot exceed 1000 characters');
  }
  
  if (!isUpdate || rent !== undefined) {
    if (!rent || isNaN(rent) || parseInt(rent) <= 0) {
      errors.push('Rent must be a positive number');
    }
  }
  
  if (!isUpdate || location !== undefined) {
    if (!location?.trim()) errors.push('Location is required');
  }
  
  if (!isUpdate || beds !== undefined) {
    if (!beds || isNaN(beds) || parseInt(beds) <= 0) {
      errors.push('Number of beds must be positive');
    }
  }

  if (!isUpdate || move_in_date !== undefined) {
    const moveIn = new Date(move_in_date);
    if (!move_in_date || isNaN(moveIn.getTime()) || moveIn < new Date().setHours(0,0,0,0)) {
      errors.push('Move-in date is required and cannot be in the past');
    }
  }

  // Contact info validation - only if provided
  if (contact_info) {
    const { mobile, email, instagram } = parsedContact;
    if (!mobile && !email && !instagram) {
      errors.push('At least one contact method is required');
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push('Invalid email format');
    }
    if (mobile && !/^\+?[\d\s-()]+$/.test(mobile)) {
      errors.push('Invalid mobile format');
    }
  }

  if (errors.length) {
    console.log('❌ Validation failed:', errors);
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  if (contact_info) {
    req.body.contact_info = parsedContact;
  }
  
  console.log('✅ Validation passed');
  next();
};

// Upload photos to Supabase
const uploadPhotos = async (files) => {
  const urls = [];
  for (const file of files) {
    const name = `room-${Date.now()}-${Math.random().toString(36).substr(2)}${path.extname(file.originalname)}`;
    const { error } = await supabase.storage.from('room-photos').upload(name, file.buffer, { contentType: file.mimetype });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('room-photos').getPublicUrl(name);
    urls.push(publicUrl);
  }
  return urls;
};

// POST /api/rooms - Create new room listing
router.post('/', requireAuth, upload.array('photos', 10), validateRoomData, async (req, res) => {
  try {
    console.log('📝 Creating room for user:', req.user.id);
    
    // Only include allowed fields for database insert (matching actual database schema)
    const allowedFields = ['title', 'description', 'rent', 'location', 'beds', 'move_in_date', 'contact_info'];
    const roomData = {
      photos: [],
      user_id: req.user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // Add only allowed fields from request body
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        roomData[field] = req.body[field];
      }
    });

    if (req.files?.length) {
      console.log('📸 Uploading', req.files.length, 'photos');
      roomData.photos = await uploadPhotos(req.files);
    }

    const { data, error } = await supabase
      .from('rooms')
      .insert([roomData])
      .select('*')
      .single();
      
    if (error) {
      console.error('❌ Database error:', error);
      throw error;
    }

    console.log('✅ Room created successfully:', data.id);
    res.status(201).json({ 
      success: true, 
      message: 'Room posted successfully', 
      data 
    });
  } catch (e) {
    console.error('❌ Error creating room:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/rooms - Fetch all rooms (PUBLIC)
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const offset = (page - 1) * limit;

    console.log('📋 Fetching rooms - page:', page, 'limit:', limit);

    // Build query with optional filters
    let query = supabase
      .from('rooms')
      .select(`
        id,
        title,
        rent,
        location,
        beds,
        move_in_date,
        contact_info,
        photos,
        created_at,
        user_id
      `, { count: 'exact' })
      .order('created_at', { ascending: false });

    // Add filters if provided
    if (req.query.location) {
      query = query.ilike('location', `%${req.query.location}%`);
    }
    if (req.query.min_rent) {
      query = query.gte('rent', parseInt(req.query.min_rent));
    }
    if (req.query.max_rent) {
      query = query.lte('rent', parseInt(req.query.max_rent));
    }
    if (req.query.beds) {
      query = query.eq('beds', parseInt(req.query.beds));
    }

    const { data, count, error } = await query.range(offset, offset + limit - 1);
    
    if (error) throw error;

    console.log('✅ Retrieved', data.length, 'rooms');

    res.json({ 
      success: true, 
      data, 
      pagination: { 
        page, 
        limit, 
        total: count, 
        pages: Math.ceil(count / limit) 
      }
    });
  } catch (e) {
    console.error('❌ Error fetching rooms:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/rooms/mine - Fetch current user's rooms
router.get('/mine', requireAuth, async (req, res) => {
  try {
    console.log('📋 Fetching rooms for user:', req.user.id);

    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    console.log('✅ Found', data.length, 'rooms for user');
    res.json({ success: true, data });
  } catch (e) {
    console.error('❌ Error fetching user rooms:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/rooms/:id - Fetch single room by ID (PUBLIC)
router.get('/:id', async (req, res) => {
  try {
    console.log('🔍 Fetching room:', req.params.id);

    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !data) {
      console.log('❌ Room not found:', req.params.id);
      return res.status(404).json({ error: 'Room not found' });
    }

    console.log('✅ Room found:', data.id);
    res.json({ success: true, data });
  } catch (e) {
    console.error('❌ Error fetching room:', e);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/rooms/:id - Update room (requires ownership)
router.put('/:id', requireAuth, requireRoomOwnershipOrAdmin(), upload.array('photos', 10), validateRoomData, async (req, res) => {
  try {
    console.log('✏️ Updating room:', req.params.id, 'by user:', req.user.id);

    // Only include allowed fields for database update (matching actual database schema)
    const allowedFields = ['title', 'description', 'rent', 'location', 'beds', 'move_in_date', 'contact_info', 'photos'];
    const roomData = {
      updated_at: new Date().toISOString()
    };
    
    // Add only allowed fields from request body
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        let value = req.body[field];
        
        // Special handling for photos field - ensure it's an array
        if (field === 'photos') {
          if (typeof value === 'string') {
            try {
              value = JSON.parse(value);
            } catch (e) {
              console.warn('⚠️ Failed to parse photos string:', value);
              value = []; // Default to empty array if parsing fails
            }
          }
          // Ensure it's an array
          if (!Array.isArray(value)) {
            value = value ? [value] : [];
          }
          console.log('📷 Processing existing photos:', value.length, 'photos');
        }
        
        roomData[field] = value;
      }
    });

    // Handle new photos if provided
    if (req.files?.length) {
      console.log('📸 Uploading new photos');
      
      // Get existing photos for cleanup
      const { data: existingRoom } = await supabase
        .from('rooms')
        .select('photos')
        .eq('id', req.params.id)
        .single();
      
      // Upload new photos
      roomData.photos = await uploadPhotos(req.files);
      
      // Clean up old photos from storage
      if (existingRoom?.photos?.length) {
        console.log('🧹 Cleaning up', existingRoom.photos.length, 'old photos');
        for (const photoUrl of existingRoom.photos) {
          try {
            const fileName = photoUrl.split('/').pop();
            await supabase.storage.from('room-photos').remove([fileName]);
          } catch (cleanupError) {
            console.warn('⚠️ Failed to cleanup old photo:', cleanupError.message);
          }
        }
      }
    }

    const { data, error } = await supabase
      .from('rooms')
      .update(roomData)
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error) throw error;

    console.log('✅ Room updated successfully');
    res.json({ 
      success: true, 
      message: 'Room updated successfully', 
      data 
    });
  } catch (e) {
    console.error('❌ Error updating room:', e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/rooms/:id - Delete room (requires ownership)
router.delete('/:id', requireAuth, requireRoomOwnershipOrAdmin(), async (req, res) => {
  try {
    console.log('🗑️ Deleting room:', req.params.id, 'by user:', req.user.id);

    // First get the room to access photos for cleanup
    const { data: room } = await supabase
      .from('rooms')
      .select('photos')
      .eq('id', req.params.id)
      .single();

    // Delete the room record
    const { error } = await supabase
      .from('rooms')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    // Clean up photos from storage
    if (room?.photos?.length) {
      console.log('🧹 Cleaning up', room.photos.length, 'photos');
      for (const photoUrl of room.photos) {
        try {
          const fileName = photoUrl.split('/').pop();
          await supabase.storage.from('room-photos').remove([fileName]);
        } catch (cleanupError) {
          console.warn('⚠️ Failed to cleanup photo:', cleanupError.message);
        }
      }
    }

    console.log('✅ Room deleted successfully');
    res.json({ 
      success: true, 
      message: 'Room deleted successfully' 
    });
  } catch (e) {
    console.error('❌ Error deleting room:', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================
// ROOM REQUEST SYSTEM
// ============================

// POST /api/rooms/:id/request - Request a room (interest from potential tenants)
router.post('/:id/request', requireAuth, async (req, res) => {
  try {
    const roomId = req.params.id;
    const userId = req.userId;
    const requestData = req.body;
    
    console.log('🏠 Creating room request for room:', roomId, 'by user:', userId);

    // Validate request data
    const validationErrors = validateRoomRequestData(requestData);
    if (validationErrors.length > 0) {
      console.error('❌ Validation errors:', validationErrors);
      return res.status(400).json({
        success: false,
        message: validationErrors[0],
        errors: validationErrors
      });
    }

    // Check if room exists and is available
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('user_id, title, location, rent, move_in_date')
      .eq('id', roomId)
      .single();

    if (roomError || !room) {
      console.log('❌ Room not found for request:', roomId);
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    // Check if user is trying to request their own room
    if (room.user_id === userId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot request your own room listing'
      });
    }

    // Check if user already has a request for this room
    const { data: existingRequest } = await supabase
      .from('room_requests')
      .select('id, status')
      .eq('room_id', roomId)
      .eq('requester_id', userId)
      .single();

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: `You already have a ${existingRequest.status} request for this room`
      });
    }

    // Create the room request
    const dbRequestData = {
      room_id: roomId,
      requester_id: userId,
      landlord_id: room.user_id,
      message: requestData.message.trim(),
      contact_method: requestData.contactMethod.trim(),
      move_in_date: requestData.moveInDate,
      stay_duration: requestData.stayDuration?.trim() || null,
      occupants: requestData.occupants || 1,
      status: 'pending', // pending, accepted, rejected, cancelled
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: newRequest, error } = await supabase
      .from('room_requests')
      .insert([dbRequestData])
      .select(`
        *,
        requester:requester_id (
          id,
          name,
          email,
          picture
        ),
        room:room_id (
          id,
          title,
          location,
          rent
        )
      `)
      .single();

    if (error) {
      console.error('❌ Database error creating room request:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create room request',
        details: error.message
      });
    }

    console.log('✅ Room request created successfully:', newRequest.id);
    res.status(201).json({
      success: true,
      message: 'Room request sent successfully',
      data: newRequest
    });

  } catch (e) {
    console.error('❌ Error creating room request:', e);
    res.status(500).json({ 
      success: false,
      message: 'Failed to create room request',
      error: e.message 
    });
  }
});

// GET /api/rooms/my/requests - Get requests that users made TO MY rooms (requests I received as room owner)
router.get('/my/requests', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    console.log('📋 Fetching requests received on my rooms by user:', userId);

    // First get the user's room IDs
    const { data: userRooms, error: roomsError } = await supabase
      .from('rooms')
      .select('id')
      .eq('user_id', userId);

    if (roomsError) {
      console.error('❌ Database error fetching user rooms:', roomsError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch your rooms',
        details: roomsError.message
      });
    }

    if (!userRooms || userRooms.length === 0) {
      console.log('✅ No rooms found for user, returning empty requests');
      return res.json({
        success: true,
        data: [],
        message: 'No requests found (you have no rooms posted)'
      });
    }

    const roomIds = userRooms.map(room => room.id);

    // Get all room requests for these specific rooms only
    const { data: requests, error } = await supabase
      .from('room_requests')
      .select(`
        *,
        requester:requester_id (
          id,
          name,
          email,
          picture
        ),
        room:room_id (
          id,
          title,
          location,
          rent,
          move_in_date,
          user_id
        )
      `)
      .in('room_id', roomIds)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Database error fetching requests on my rooms:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch requests on your rooms',
        details: error.message
      });
    }

    // Security check: Filter out any requests that don't belong to user's rooms
    const filteredRequests = (requests || []).filter(req => 
      req.room && req.room.user_id === userId
    );

    console.log(`📊 Found ${filteredRequests.length} requests on user's rooms`);

    res.json({
      success: true,
      data: filteredRequests,
      count: filteredRequests.length
    });

  } catch (e) {
    console.error('❌ Error fetching room requests:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch room requests',
      error: e.message
    });
  }
});

// GET /api/rooms/requests/sent - Get requests that I sent (as a requester)
router.get('/requests/sent', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    console.log('📋 Fetching room requests sent by user:', userId);

    const { data: requests, error } = await supabase
      .from('room_requests')
      .select(`
        *,
        room:room_id (
          id,
          title,
          location,
          rent,
          move_in_date,
          photos
        ),
        landlord:landlord_id (
          id,
          name,
          email
        )
      `)
      .eq('requester_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Database error fetching sent requests:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch your sent requests',
        details: error.message
      });
    }

    console.log(`📊 Found ${requests?.length || 0} requests sent by user`);

    res.json({
      success: true,
      data: requests || [],
      count: requests?.length || 0
    });

  } catch (e) {
    console.error('❌ Error fetching sent room requests:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sent room requests',
      error: e.message
    });
  }
});

// PUT /api/rooms/requests/:requestId/respond - Respond to a room request (for room owners)
router.put('/requests/:requestId/respond', requireAuth, async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const userId = req.userId;
    const { status, responseMessage } = req.body;

    console.log('📝 Responding to room request:', requestId, 'with status:', status);

    // Validate status
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be "approved" or "rejected"'
      });
    }

    // Get the request and verify ownership
    const { data: request, error: requestError } = await supabase
      .from('room_requests')
      .select(`
        *,
        room:room_id (
          id,
          title,
          user_id
        )
      `)
      .eq('id', requestId)
      .single();

    if (requestError || !request) {
      console.log('❌ Room request not found:', requestId);
      return res.status(404).json({
        success: false,
        message: 'Room request not found'
      });
    }

    // Check if user owns the room
    if (!request.room || request.room.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only respond to requests for your own rooms'
      });
    }

    // Check if request is still pending
    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `This request has already been ${request.status}`
      });
    }

    // Update the request
    const updateData = {
      status: status,
      response_message: responseMessage?.trim() || null,
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: updatedRequest, error: updateError } = await supabase
      .from('room_requests')
      .update(updateData)
      .eq('id', requestId)
      .select(`
        *,
        requester:requester_id (
          id,
          name,
          email
        ),
        room:room_id (
          id,
          title,
          location,
          rent
        )
      `)
      .single();

    if (updateError) {
      console.error('❌ Database error updating room request:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to update room request',
        details: updateError.message
      });
    }

    console.log(`✅ Room request ${status} successfully`);
    res.json({
      success: true,
      message: `Room request ${status} successfully`,
      data: updatedRequest
    });

  } catch (e) {
    console.error('❌ Error responding to room request:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to respond to room request',
      error: e.message
    });
  }
});

// DELETE /api/rooms/requests/:requestId - Cancel a room request (for requesters)
router.delete('/requests/:requestId', requireAuth, async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const userId = req.userId;

    console.log('🗑️ Cancelling room request:', requestId, 'by user:', userId);

    // Get the request and verify ownership
    const { data: request, error: requestError } = await supabase
      .from('room_requests')
      .select('id, requester_id, status')
      .eq('id', requestId)
      .single();

    if (requestError || !request) {
      console.log('❌ Room request not found:', requestId);
      return res.status(404).json({
        success: false,
        message: 'Room request not found'
      });
    }

    // Check if user is the requester
    if (request.requester_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only cancel your own requests'
      });
    }

    // Check if request can be cancelled
    if (request.status === 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel an approved request. Please contact the room owner.'
      });
    }

    // Update status to cancelled instead of deleting
    const { error: updateError } = await supabase
      .from('room_requests')
      .update({ 
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', requestId);

    if (updateError) {
      console.error('❌ Database error cancelling room request:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to cancel room request',
        details: updateError.message
      });
    }

    console.log('✅ Room request cancelled successfully');
    res.json({
      success: true,
      message: 'Room request cancelled successfully'
    });

  } catch (e) {
    console.error('❌ Error cancelling room request:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel room request',
      error: e.message
    });
  }
});

// Multer error handling
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large' });
    if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ error: 'Too many files' });
  }
  if (err.message === 'Only image files are allowed') return res.status(400).json({ error: err.message });
  next(err);
});

module.exports = router;