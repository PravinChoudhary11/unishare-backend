// routes/rooms.js - Updated with authentication
const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabase = require('../config/supabase');
const path = require('path');
const { requireAuth, requireOwnership } = require('../middleware/auth');

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
  const { title, rent, location, beds, move_in_date, contact_info } = req.body;
  const errors = [];

  // Parse contact_info
  let parsedContact = {};
  try {
    parsedContact = typeof contact_info === 'string' ? JSON.parse(contact_info) : contact_info || {};
  } catch {
    return res.status(400).json({ error: 'Invalid contact_info format' });
  }

  if (!title?.trim()) errors.push('Title is required');
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

// POST create room - REQUIRES AUTHENTICATION
router.post('/', requireAuth, upload.array('photos', 10), validateRoomData, async (req, res) => {
  try {
    console.log('📝 Creating room for user:', req.user.id);
    
    const roomData = { 
      ...req.body, 
      photos: [],
      user_id: req.user.id,  // Add user ownership
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

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

// GET all rooms - PUBLIC (no auth required)
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50); // Max 50 per page
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

// GET user's own rooms - REQUIRES AUTHENTICATION
router.get('/my-rooms', requireAuth, async (req, res) => {
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

// GET room by ID - PUBLIC
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

// PUT update room - REQUIRES AUTHENTICATION + OWNERSHIP
router.put('/:id', requireAuth, requireOwnership(), upload.array('photos', 10), validateRoomData, async (req, res) => {
  try {
    console.log('✏️ Updating room:', req.params.id, 'by user:', req.user.id);

    const roomData = { 
      ...req.body, 
      updated_at: new Date().toISOString()
    };

    // Handle new photos if provided
    if (req.files?.length) {
      console.log('📸 Uploading new photos');
      roomData.photos = await uploadPhotos(req.files);
    }

    const { data, error } = await supabase
      .from('rooms')
      .update(roomData)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id) // Double-check ownership
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

// DELETE room - REQUIRES AUTHENTICATION + OWNERSHIP
router.delete('/:id', requireAuth, requireOwnership(), async (req, res) => {
  try {
    console.log('🗑️ Deleting room:', req.params.id, 'by user:', req.user.id);

    // First get the room to access photos for cleanup
    const { data: room } = await supabase
      .from('rooms')
      .select('photos')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    // Delete the room record
    const { error } = await supabase
      .from('rooms')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id); // Double-check ownership

    if (error) throw error;

    // Clean up photos from storage (optional - consider doing this in background)
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