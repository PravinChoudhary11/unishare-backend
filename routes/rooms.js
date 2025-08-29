const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabase = require('../config/supabase');
const path = require('path');

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

// POST create room
router.post('/', upload.array('photos', 10), validateRoomData, async (req, res) => {
  try {
    const roomData = { ...req.body, photos: [] };

    if (req.files?.length) {
      roomData.photos = await uploadPhotos(req.files);
    }

    const { data, error } = await supabase.from('rooms').insert([roomData]).select('*').single();
    if (error) throw error;

    res.status(201).json({ success: true, message: 'Room posted', data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET all rooms with pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const { data, count, error } = await supabase.from('rooms').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw error;

    res.json({ success: true, data, pagination: { page, limit, total: count, pages: Math.ceil(count / limit) } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET room by ID
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('rooms').select('*').eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: 'Room not found' });
    res.json({ success: true, data });
  } catch (e) {
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
