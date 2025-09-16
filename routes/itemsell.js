// routes/itemsell.js - Item Sell CRUD with Backend Image Upload
const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabase = require('../config/supabase');
const { requireAuth, optionalAuth, requireItemOwnershipOrAdmin } = require('../middleware/requireAuth');
const path = require('path');

// Configure multer for handling form data with image
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 5 * 1024 * 1024, // 5MB max
    files: 1 // Single file upload
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname !== 'image') {
      return cb(null, false); // Skip non-image fields
    }
    
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed'), false);
    }
  }
});

// Image upload helper
const uploadImageToStorage = async (file, userId) => {
  if (!file) return null;
  
  try {
    // Generate secure filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 8);
    const fileExt = path.extname(file.originalname).toLowerCase();
    const fileName = `items/${userId}/${timestamp}_${randomString}${fileExt}`;

    console.log('Uploading image to:', fileName);

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
      throw new Error(`Image upload failed: ${error.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('marketplace-items')
      .getPublicUrl(fileName);

    if (!urlData?.publicUrl) {
      throw new Error('Failed to generate image URL');
    }

    console.log('Image uploaded successfully:', urlData.publicUrl);
    return {
      url: urlData.publicUrl,
      path: fileName
    };
  } catch (error) {
    console.error('Image upload helper error:', error);
    throw error;
  }
};

// Validation helpers
const validateItemData = (data) => {
  const errors = [];
  
  if (!data.title || data.title.trim().length < 3) {
    errors.push('Title must be at least 3 characters long');
  }
  
  if (!data.price || isNaN(data.price) || parseFloat(data.price) < 0) {
    errors.push('Price must be a valid positive number');
  }
  
  if (!data.category || data.category.trim().length === 0) {
    errors.push('Category is required');
  }
  
  if (!data.condition || !['new', 'like-new', 'good', 'fair', 'damaged'].includes(data.condition)) {
    errors.push('Condition must be one of: new, like-new, good, fair, damaged');
  }
  
  if (!data.location || data.location.trim().length === 0) {
    errors.push('Location is required');
  }
  
  if (!data.available_from || !Date.parse(data.available_from)) {
    errors.push('Available from date is required and must be valid');
  }
  
  return errors;
};

// POST /itemsell - Create new item listing with image
router.post('/', requireAuth, upload.single('image'), async (req, res) => {
  try {
    console.log('Creating new item listing for user:', req.userId);
    console.log('Has image file:', !!req.file);

    // Parse contact_info if it's a string (from FormData)
    let contactInfo = {};
    if (req.body.contact_info) {
      try {
        contactInfo = typeof req.body.contact_info === 'string' 
          ? JSON.parse(req.body.contact_info) 
          : req.body.contact_info;
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid contact_info format'
        });
      }
    }

    const itemData = {
      title: req.body.title,
      price: req.body.price,
      category: req.body.category,
      condition: req.body.condition,
      location: req.body.location,
      available_from: req.body.available_from,
      description: req.body.description,
      contact_info: contactInfo
    };

    // Validate required fields
    const validationErrors = validateItemData(itemData);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    // Upload image if provided
    let imageUrl = null;
    if (req.file) {
      try {
        const uploadResult = await uploadImageToStorage(req.file, req.userId);
        imageUrl = uploadResult.url;
      } catch (uploadError) {
        return res.status(500).json({
          success: false,
          message: 'Image upload failed',
          details: uploadError.message
        });
      }
    }

    // Prepare item data for database
    const dbItemData = {
      user_id: req.userId,
      title: itemData.title.trim(),
      price: parseFloat(itemData.price),
      category: itemData.category.trim().toLowerCase(),
      condition: itemData.condition,
      location: itemData.location.trim(),
      available_from: itemData.available_from,
      description: itemData.description ? itemData.description.trim() : null,
      photos: [], // Legacy field
      image_url: imageUrl,
      contact_info: contactInfo
    };

    // Insert item into database
    const { data: item, error } = await supabase
      .from('item_sell')
      .insert([dbItemData])
      .select(`
        *,
        users:user_id (
          id,
          name,
          email
        )
      `)
      .single();

    if (error) {
      console.error('Database error creating item:', error);
      
      // Clean up uploaded image if database insert failed
      if (imageUrl) {
        try {
          const imagePath = imageUrl.split('/marketplace-items/')[1];
          await supabase.storage.from('marketplace-items').remove([imagePath]);
        } catch (cleanupError) {
          console.warn('Failed to cleanup image after database error:', cleanupError);
        }
      }
      
      return res.status(500).json({
        success: false,
        message: 'Failed to create item listing',
        details: error.message
      });
    }

    console.log('Item created successfully:', item.id);
    res.status(201).json({
      success: true,
      message: 'Item listing created successfully',
      data: item
    });

  } catch (error) {
    console.error('Error creating item:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// PUT /itemsell/:id - Update existing item with optional new image
router.put('/:id', requireAuth, requireItemOwnershipOrAdmin(), upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Updating item:', id, 'by user:', req.userId);
    console.log('Has new image file:', !!req.file);

    // Parse contact_info if it's a string (from FormData)
    let contactInfo = {};
    if (req.body.contact_info) {
      try {
        contactInfo = typeof req.body.contact_info === 'string' 
          ? JSON.parse(req.body.contact_info) 
          : req.body.contact_info;
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid contact_info format'
        });
      }
    }

    const itemData = {
      title: req.body.title,
      price: req.body.price,
      category: req.body.category,
      condition: req.body.condition,
      location: req.body.location,
      available_from: req.body.available_from,
      description: req.body.description,
      contact_info: contactInfo
    };

    // Validate update data
    const validationErrors = validateItemData(itemData);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    // Get current item to access existing image
    const { data: existingItem, error: fetchError } = await supabase
      .from('item_sell')
      .select('image_url')
      .eq('id', id)
      .single();

    if (fetchError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch existing item'
      });
    }

    let imageUrl = existingItem.image_url; // Keep existing image by default

    // Upload new image if provided
    if (req.file) {
      try {
        const uploadResult = await uploadImageToStorage(req.file, req.userId);
        imageUrl = uploadResult.url;

        // Delete old image if it exists
        if (existingItem.image_url) {
          try {
            const oldImagePath = existingItem.image_url.split('/marketplace-items/')[1];
            if (oldImagePath) {
              await supabase.storage.from('marketplace-items').remove([oldImagePath]);
              console.log('Deleted old image:', oldImagePath);
            }
          } catch (deleteError) {
            console.warn('Failed to delete old image:', deleteError);
          }
        }
      } catch (uploadError) {
        return res.status(500).json({
          success: false,
          message: 'Image upload failed',
          details: uploadError.message
        });
      }
    }

    // Prepare update data
    const updateData = {
      title: itemData.title.trim(),
      price: parseFloat(itemData.price),
      category: itemData.category.trim().toLowerCase(),
      condition: itemData.condition,
      location: itemData.location.trim(),
      available_from: itemData.available_from,
      description: itemData.description ? itemData.description.trim() : null,
      photos: [], // Legacy field
      image_url: imageUrl,
      contact_info: contactInfo,
      updated_at: new Date().toISOString()
    };

    // Update item (ownership already verified by middleware)
    const { data: updatedItem, error: updateError } = await supabase
      .from('item_sell')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        users:user_id (
          id,
          name,
          email
        )
      `)
      .single();

    if (updateError) {
      console.error('Database error updating item:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to update item',
        details: updateError.message
      });
    }

    console.log('Item updated successfully:', id);
    res.json({
      success: true,
      message: 'Item updated successfully',
      data: updatedItem
    });

  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// DELETE /itemsell/:id - Delete item and associated image
router.delete('/:id', requireAuth, requireItemOwnershipOrAdmin(), async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Deleting item:', id, 'by user:', req.userId);

    // Get item details before deletion (for cleanup and response)
    const { data: existingItem, error: fetchError } = await supabase
      .from('item_sell')
      .select('title, image_url')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('Error fetching item for deletion:', fetchError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch item details'
      });
    }

    // Delete item from database (ownership already verified by middleware)
    const { error: deleteError } = await supabase
      .from('item_sell')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Database error deleting item:', deleteError);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete item',
        details: deleteError.message
      });
    }

    // Delete associated image from storage
    if (existingItem?.image_url) {
      try {
        const imagePath = existingItem.image_url.split('/marketplace-items/')[1];
        if (imagePath) {
          await supabase.storage.from('marketplace-items').remove([imagePath]);
          console.log('Deleted associated image:', imagePath);
        }
      } catch (imageError) {
        console.warn('Failed to delete image:', imageError.message);
      }
    }

    console.log('Item deleted successfully:', id);
    res.json({
      success: true,
      message: `Item "${existingItem.title}" deleted successfully`
    });

  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /itemsell - Fetch all items (PUBLIC with optional auth)
router.get('/', optionalAuth, async (req, res) => {
  try {
    console.log('Fetching marketplace items', req.userId ? `for user: ${req.userId}` : '(anonymous)');
    
    const {
      category,
      condition,
      min_price,
      max_price,
      location,
      search,
      sort = 'created_at',
      order = 'desc',
      limit = 50,
      offset = 0
    } = req.query;

    let query = supabase
      .from('item_sell')
      .select(`
        *,
        users:user_id (
          id,
          name
        )
      `);

    // Apply filters
    if (category && category !== 'all') {
      query = query.eq('category', category.toLowerCase());
    }
    
    if (condition && condition !== 'all') {
      query = query.eq('condition', condition);
    }
    
    if (min_price && !isNaN(min_price)) {
      query = query.gte('price', parseFloat(min_price));
    }
    
    if (max_price && !isNaN(max_price)) {
      query = query.lte('price', parseFloat(max_price));
    }
    
    if (location) {
      query = query.ilike('location', `%${location}%`);
    }
    
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Apply sorting
    const validSortColumns = ['created_at', 'price', 'title'];
    const validOrders = ['asc', 'desc'];
    
    if (validSortColumns.includes(sort) && validOrders.includes(order)) {
      query = query.order(sort, { ascending: order === 'asc' });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    // Apply pagination
    const limitNum = Math.min(parseInt(limit) || 50, 100);
    const offsetNum = parseInt(offset) || 0;
    
    query = query.range(offsetNum, offsetNum + limitNum - 1);

    const { data: items, error, count } = await query;

    if (error) {
      console.error('Database error fetching items:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch items',
        details: error.message
      });
    }

    console.log(`Fetched ${items?.length || 0} marketplace items`);
    res.json({
      success: true,
      data: items || [],
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total: count
      }
    });

  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /itemsell/mine - Fetch current user's items (REQUIRES AUTH)
router.get('/mine', requireAuth, async (req, res) => {
  try {
    console.log('Fetching items for user:', req.userId);
    
    const { data: items, error } = await supabase
      .from('item_sell')
      .select(`
        *,
        users:user_id (
          id,
          name,
          email
        )
      `)
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Database error fetching user items:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch your items',
        details: error.message
      });
    }

    console.log(`Fetched ${items?.length || 0} items for user ${req.userId}`);
    res.json({
      success: true,
      data: items || []
    });

  } catch (error) {
    console.error('Error fetching user items:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /itemsell/:id - Fetch single item by ID (PUBLIC)
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Fetching item:', id, req.userId ? `by user: ${req.userId}` : '(anonymous)');

    const { data: item, error } = await supabase
      .from('item_sell')
      .select(`
        *,
        users:user_id (
          id,
          name,
          email
        )
      `)
      .eq('id', id)
      .single();

    if (error || !item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    console.log('Item fetched successfully:', id);
    res.json({
      success: true,
      data: item
    });

  } catch (error) {
    console.error('Error fetching item:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
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