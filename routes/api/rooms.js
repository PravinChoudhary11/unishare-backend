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

// Validation middleware
const validateRoomData = (req, res, next) => {
  const { title, description, rent, location, beds, move_in_date, contact_info } = req.body;
  const errors = [];

  // Parse contact_info
  let parsedContact = {};
  try {
    parsedContact = typeof contact_info === 'string' ? JSON.parse(contact_info) : contact_info || {};
  } catch {
    return res.status(400).json({ error: 'Invalid contact_info format' });
  }

  if (!title?.trim()) errors.push('Title is required');
  if (description && description.length > 1000) errors.push('Description cannot exceed 1000 characters');
  if (!rent || isNaN(rent) || parseInt(rent) <= 0) errors.push('Rent must be a positive number');
  if (!location?.trim()) errors.push('Location is required');
  if (!beds || isNaN(beds) || parseInt(beds) <= 0) errors.push('Number of beds must be positive');

  const moveIn = new Date(move_in_date);
  if (!move_in_date || isNaN(moveIn.getTime()) || moveIn < new Date().setHours(0,0,0,0)) {
    errors.push('Move-in date is required and cannot be in the past');
  }

  const { mobile, email, instagram } = parsedContact;
  if (!mobile && !email && !instagram) errors.push('At least one contact method is required');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Invalid email format');
  if (mobile && !/^\+?[\d\s-()]+$/.test(mobile)) errors.push('Invalid mobile format');

  if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

  req.body.contact_info = parsedContact;
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
        roomData[field] = req.body[field];
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