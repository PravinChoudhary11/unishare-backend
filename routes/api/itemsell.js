// routes/api/itemsell.js - Item Sell CRUD with Backend Image Upload (User API)
const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabase = require('../../config/supabase');
const { requireAuth, optionalAuth, requireItemOwnershipOrAdmin } = require('../../middleware/requireAuth');
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

// Helper function to validate item request data
const validateItemRequestData = (data) => {
  const errors = [];

  if (!data.message || !data.message.trim()) {
    errors.push('Message is required');
  }

  if (data.message && data.message.length > 500) {
    errors.push('Message cannot exceed 500 characters');
  }

  if (!data.contactMethod || !data.contactMethod.trim()) {
    errors.push('Preferred contact method is required');
  }

  return errors;
};

// POST /api/itemsell - Create new item listing with image
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

// PUT /api/itemsell/:id - Update existing item with optional new image
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

// DELETE /api/itemsell/:id - Delete item and associated image
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

// GET /api/itemsell - Fetch all items (PUBLIC with optional auth)
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

// GET /api/itemsell/mine - Fetch current user's items (REQUIRES AUTH)
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

// GET /api/itemsell/:id - Fetch single item by ID (PUBLIC)
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

// ============================
// ITEM REQUEST SYSTEM
// ============================

// POST /api/itemsell/:id/request - Request to buy an item
router.post('/:id/request', requireAuth, async (req, res) => {
  try {
    const itemId = req.params.id;
    const userId = req.userId;
    const requestData = req.body;
    
    console.log('🛍️ Creating item request for item:', itemId, 'by user:', userId);

    // Validate request data
    const validationErrors = validateItemRequestData(requestData);
    if (validationErrors.length > 0) {
      console.error('❌ Validation errors:', validationErrors);
      return res.status(400).json({
        success: false,
        message: validationErrors[0],
        errors: validationErrors
      });
    }

    // Check if item exists and is available
    const { data: item, error: itemError } = await supabase
      .from('item_sell')
      .select('user_id, title, price, category, condition, location')
      .eq('id', itemId)
      .single();

    if (itemError || !item) {
      console.log('❌ Item not found for request:', itemId);
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    // Check if user is trying to request their own item
    if (item.user_id === userId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot request your own item'
      });
    }

    // Check if user already has a request for this item
    const { data: existingRequest } = await supabase
      .from('item_requests')
      .select('id, status')
      .eq('item_id', itemId)
      .eq('requester_id', userId)
      .single();

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: `You already have a ${existingRequest.status} request for this item`
      });
    }

    // Create the item request
    const dbRequestData = {
      item_id: itemId,
      requester_id: userId,
      seller_id: item.user_id,
      message: requestData.message.trim(),
      contact_method: requestData.contactMethod.trim(),
      offered_price: requestData.offeredPrice ? parseFloat(requestData.offeredPrice) : null,
      pickup_preference: requestData.pickupPreference?.trim() || null,
      status: 'pending', // pending, accepted, rejected, cancelled
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: newRequest, error } = await supabase
      .from('item_requests')
      .insert([dbRequestData])
      .select(`
        *,
        requester:requester_id (
          id,
          name,
          email,
          picture
        ),
        item:item_id (
          id,
          title,
          price,
          category,
          condition
        )
      `)
      .single();

    if (error) {
      console.error('❌ Database error creating item request:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create item request',
        details: error.message
      });
    }

    console.log('✅ Item request created successfully:', newRequest.id);
    res.status(201).json({
      success: true,
      message: 'Item request sent successfully',
      data: newRequest
    });

  } catch (e) {
    console.error('❌ Error creating item request:', e);
    res.status(500).json({ 
      success: false,
      message: 'Failed to create item request',
      error: e.message 
    });
  }
});

// GET /api/itemsell/my/requests - Get requests that users made TO MY items (requests I received as seller)
router.get('/my/requests', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    console.log('📋 Fetching requests received on my items by user:', userId);

    // First get the user's item IDs
    const { data: userItems, error: itemsError } = await supabase
      .from('item_sell')
      .select('id')
      .eq('user_id', userId);

    if (itemsError) {
      console.error('❌ Database error fetching user items:', itemsError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch your items',
        details: itemsError.message
      });
    }

    if (!userItems || userItems.length === 0) {
      console.log('✅ No items found for user, returning empty requests');
      return res.json({
        success: true,
        data: [],
        message: 'No requests found (you have no items posted)'
      });
    }

    const itemIds = userItems.map(item => item.id);

    // Get all item requests for these specific items only
    const { data: requests, error } = await supabase
      .from('item_requests')
      .select(`
        *,
        requester:requester_id (
          id,
          name,
          email,
          picture
        ),
        item:item_id (
          id,
          title,
          price,
          category,
          condition,
          location,
          image_url,
          user_id
        )
      `)
      .in('item_id', itemIds)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Database error fetching requests on my items:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch requests on your items',
        details: error.message
      });
    }

    // Security check: Filter out any requests that don't belong to user's items
    const filteredRequests = (requests || []).filter(req => 
      req.item && req.item.user_id === userId
    );

    console.log(`📊 Found ${filteredRequests.length} requests on user's items`);

    res.json({
      success: true,
      data: filteredRequests,
      count: filteredRequests.length
    });

  } catch (e) {
    console.error('❌ Error fetching item requests:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch item requests',
      error: e.message
    });
  }
});

// GET /api/itemsell/requests/sent - Get requests that I sent (as a buyer)
router.get('/requests/sent', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    console.log('📋 Fetching item requests sent by user:', userId);

    const { data: requests, error } = await supabase
      .from('item_requests')
      .select(`
        *,
        item:item_id (
          id,
          title,
          price,
          category,
          condition,
          location,
          image_url
        ),
        seller:seller_id (
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
    console.error('❌ Error fetching sent item requests:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sent item requests',
      error: e.message
    });
  }
});

// PUT /api/itemsell/requests/:requestId/respond - Respond to an item request (for sellers)
router.put('/requests/:requestId/respond', requireAuth, async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const userId = req.userId;
    const { status, responseMessage, agreedPrice } = req.body;

    console.log('📝 Responding to item request:', requestId, 'with status:', status);

    // Validate status
    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be "accepted" or "rejected"'
      });
    }

    // Get the request and verify ownership
    const { data: request, error: requestError } = await supabase
      .from('item_requests')
      .select(`
        *,
        item:item_id (
          id,
          title,
          user_id
        )
      `)
      .eq('id', requestId)
      .single();

    if (requestError || !request) {
      console.log('❌ Item request not found:', requestId);
      return res.status(404).json({
        success: false,
        message: 'Item request not found'
      });
    }

    // Check if user owns the item
    if (!request.item || request.item.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only respond to requests for your own items'
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
      agreed_price: status === 'accepted' && agreedPrice ? parseFloat(agreedPrice) : null,
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: updatedRequest, error: updateError } = await supabase
      .from('item_requests')
      .update(updateData)
      .eq('id', requestId)
      .select(`
        *,
        requester:requester_id (
          id,
          name,
          email
        ),
        item:item_id (
          id,
          title,
          price,
          category
        )
      `)
      .single();

    if (updateError) {
      console.error('❌ Database error updating item request:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to update item request',
        details: updateError.message
      });
    }

    console.log(`✅ Item request ${status} successfully`);
    res.json({
      success: true,
      message: `Item request ${status} successfully`,
      data: updatedRequest
    });

  } catch (e) {
    console.error('❌ Error responding to item request:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to respond to item request',
      error: e.message
    });
  }
});

// DELETE /api/itemsell/requests/:requestId - Cancel an item request (for buyers)
router.delete('/requests/:requestId', requireAuth, async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const userId = req.userId;

    console.log('🗑️ Cancelling item request:', requestId, 'by user:', userId);

    // Get the request and verify ownership
    const { data: request, error: requestError } = await supabase
      .from('item_requests')
      .select('id, requester_id, status')
      .eq('id', requestId)
      .single();

    if (requestError || !request) {
      console.log('❌ Item request not found:', requestId);
      return res.status(404).json({
        success: false,
        message: 'Item request not found'
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
    if (request.status === 'accepted') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel an accepted request. Please contact the seller.'
      });
    }

    // Update status to cancelled instead of deleting
    const { error: updateError } = await supabase
      .from('item_requests')
      .update({ 
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', requestId);

    if (updateError) {
      console.error('❌ Database error cancelling item request:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to cancel item request',
        details: updateError.message
      });
    }

    console.log('✅ Item request cancelled successfully');
    res.json({
      success: true,
      message: 'Item request cancelled successfully'
    });

  } catch (e) {
    console.error('❌ Error cancelling item request:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel item request',
      error: e.message
    });
  }
});

module.exports = router;