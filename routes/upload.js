// routes/upload.js - Secure image upload through backend
const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/requireAuth');
const path = require('path');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 5 * 1024 * 1024, // 5MB max
    files: 1 // Single file upload
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed'), false);
    }
  }
});

/**
 * POST /upload/item-image - Upload item image securely through backend
 */
router.post('/item-image', requireAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    const file = req.file;
    const userId = req.userId;
    
    // Generate secure filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 8);
    const fileExt = path.extname(file.originalname).toLowerCase();
    const fileName = `items/${userId}/${timestamp}_${randomString}${fileExt}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('marketplace-items')
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Storage upload error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload image',
        details: error.message
      });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('marketplace-items')
      .getPublicUrl(fileName);

    if (!urlData?.publicUrl) {
      console.error('Failed to get public URL');
      return res.status(500).json({
        success: false,
        message: 'Failed to generate image URL'
      });
    }

    res.json({
      success: true,
      message: 'Image uploaded successfully',
      data: {
        url: urlData.publicUrl,
        path: fileName
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during upload',
      details: error.message
    });
  }
});

/**
 * DELETE /upload/item-image - Delete item image
 */
router.delete('/item-image', requireAuth, async (req, res) => {
  try {
    const { imagePath } = req.body;

    if (!imagePath) {
      return res.status(400).json({
        success: false,
        message: 'Image path is required'
      });
    }

    // Extract storage path from full URL if needed

    // Extract path from URL if full URL is provided
    let storagePath = imagePath;
    if (imagePath.includes('/marketplace-items/')) {
      storagePath = imagePath.split('/marketplace-items/')[1];
    }

    // Verify user owns this image (check if path contains their userId)
    if (!storagePath.includes(`items/${req.userId}/`)) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own images'
      });
    }

    const { error } = await supabase.storage
      .from('marketplace-items')
      .remove([storagePath]);

    if (error) {
      console.error('Delete error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete image',
        details: error.message
      });
    }

    res.json({
      success: true,
      message: 'Image deleted successfully'
    });

  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during deletion',
      details: error.message
    });
  }
});

// Multer error handling
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB.'
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected file field'
      });
    }
  }
  
  if (err.message.includes('Only JPEG, PNG, and WebP images are allowed')) {
    return res.status(400).json({
      success: false,
      message: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed.'
    });
  }
  
  next(err);
});

module.exports = router;