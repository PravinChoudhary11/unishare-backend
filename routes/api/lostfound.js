const express = require('express');
const multer = require('multer');
const path = require('path');
const supabase = require('../../config/supabase');
const { requireAuth, optionalAuth, requireOwnership, requireLostFoundOwnershipOrAdmin } = require('../../middleware/requireAuth');

const router = express.Router();

// Configure multer for image uploads (multiple images allowed)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 5 * 1024 * 1024, // 5MB max per file
    files: 5 // Maximum 5 images
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname !== 'images') {
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

// Helper function to format contact info
const formatContactInfo = (contacts) => {
  const contactInfo = {};
  if (Array.isArray(contacts)) {
    contacts.forEach(contact => {
      if (contact.value && contact.value.trim()) {
        contactInfo[contact.type] = contact.value.trim();
      }
    });
  }
  return contactInfo;
};

// Helper function to validate lost/found request data
const validateFoundItemRequestData = (data) => {
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

  // Optional validation for proof description
  if (data.proofDescription && data.proofDescription.trim().length > 1000) {
    errors.push('Proof description must be less than 1000 characters');
  }

  return errors;
};

// Helper function to validate lost/found item data
const validateItemData = (data) => {
  const errors = [];

  if (!data.itemName || !data.itemName.trim()) {
    errors.push('Item name is required');
  }

  if (!data.description || !data.description.trim()) {
    errors.push('Description is required');
  }

  if (!data.mode || !['lost', 'found'].includes(data.mode)) {
    errors.push('Valid mode (lost/found) is required');
  }

  // Mode-specific validations
  if (data.mode === 'lost') {
    if (!data.whereLastSeen || !data.whereLastSeen.trim()) {
      errors.push('Where last seen is required for lost items');
    }
    if (!data.dateLost) {
      errors.push('Date lost is required');
    }
  }

  if (data.mode === 'found') {
    if (!data.whereFound || !data.whereFound.trim()) {
      errors.push('Where found is required for found items');
    }
    if (!data.dateFound) {
      errors.push('Date found is required');
    }
  }

  // Validate contact info
  if (!data.contact_info || Object.keys(data.contact_info).length === 0) {
    errors.push('At least one contact method is required');
  }

  return errors;
};

// Helper function to upload multiple images to storage
const uploadImagesToStorage = async (files, userId, itemId) => {
  if (!files || files.length === 0) return [];
  
  try {
    // Check if bucket exists, create if not
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(bucket => bucket.name === 'lostfound-images');
    
    if (!bucketExists) {
      console.log('🪣 Creating lostfound-images bucket...');
      const { error: bucketError } = await supabase.storage.createBucket('lostfound-images', {
        public: true,
        fileSizeLimit: 5242880, // 5MB
        allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
      });
      
      if (bucketError) {
        console.error('❌ Error creating bucket:', bucketError);
        throw new Error(`Failed to create storage bucket: ${bucketError.message}`);
      }
      console.log('✅ Created lostfound-images bucket successfully');
    }

    const uploadPromises = files.map(async (file, index) => {
      // Generate secure filename
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 8);
      const fileExt = path.extname(file.originalname).toLowerCase();
      const fileName = `lostfound/${userId}/${itemId}/${timestamp}_${index}_${randomString}${fileExt}`;

      console.log('📸 Uploading image to:', fileName);

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('lostfound-images')
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error('❌ Storage upload error:', error);
        throw new Error(`Image upload failed: ${error.message}`);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('lostfound-images')
        .getPublicUrl(fileName);

      if (!urlData?.publicUrl) {
        throw new Error('Failed to generate image URL');
      }

      console.log('✅ Image uploaded successfully:', urlData.publicUrl);
      return {
        url: urlData.publicUrl,
        path: fileName
      };
    });

    const results = await Promise.all(uploadPromises);
    return results;
  } catch (error) {
    console.error('❌ Image upload helper error:', error);
    throw error;
  }
};

// GET /api/lostfound/my - Get current user's lost/found items
router.get('/my', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    console.log('📋 Fetching lost/found items for user:', userId);

    const { data: items, error } = await supabase
      .from('lost_found_items')
      .select(`
        *,
        users:user_id (
          id,
          name,
          email
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Database error fetching user items:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch your items',
        details: error.message
      });
    }

    console.log(`✅ Fetched ${items.length} items for user ${userId}`);
    res.json({
      success: true,
      data: items
    });

  } catch (error) {
    console.error('❌ Error in /my route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// POST /api/lostfound/create - Create new lost/found item
router.post('/create', requireAuth, upload.array('images', 5), async (req, res) => {
  try {
    const userId = req.userId;
    console.log('📝 Creating new lost/found item for user:', userId);
    console.log('📸 Has image files:', req.files?.length || 0);

    let itemData;

    // Parse item data from form
    try {
      itemData = typeof req.body.itemData === 'string' 
        ? JSON.parse(req.body.itemData) 
        : req.body;
    } catch (parseError) {
      console.error('❌ JSON parsing error:', parseError);
      return res.status(400).json({
        success: false,
        message: 'Invalid item data format'
      });
    }

    // Format contact info if it's an array
    if (Array.isArray(itemData.contacts)) {
      itemData.contact_info = formatContactInfo(itemData.contacts);
    }

    // Validate item data
    const validationErrors = validateItemData(itemData);
    if (validationErrors.length > 0) {
      console.error('❌ Validation errors:', validationErrors);
      return res.status(400).json({
        success: false,
        message: validationErrors[0],
        errors: validationErrors
      });
    }

    // Generate temporary item ID for image organization
    const tempItemId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Upload images if provided
    let imageUrls = [];
    if (req.files && req.files.length > 0) {
      try {
        const uploadResults = await uploadImagesToStorage(req.files, userId, tempItemId);
        imageUrls = uploadResults.map(result => result.url);
      } catch (uploadError) {
        console.error('❌ Image upload failed:', uploadError);
        return res.status(500).json({
          success: false,
          message: 'Image upload failed',
          details: uploadError.message
        });
      }
    }

    // Prepare item data for database
    const dbItemData = {
      user_id: userId,
      item_name: itemData.itemName.trim(),
      description: itemData.description.trim(),
      mode: itemData.mode, // 'lost' or 'found'
      // Location data
      where_last_seen: itemData.mode === 'lost' ? itemData.whereLastSeen?.trim() || null : null,
      where_found: itemData.mode === 'found' ? itemData.whereFound?.trim() || null : null,
      // Date/time data
      date_lost: itemData.mode === 'lost' ? itemData.dateLost : null,
      time_lost: itemData.mode === 'lost' ? itemData.timeLost || null : null,
      date_found: itemData.mode === 'found' ? itemData.dateFound : null,
      time_found: itemData.mode === 'found' ? itemData.timeFound || null : null,
      // Contact and images
      contact_info: itemData.contact_info,
      image_urls: imageUrls,
      status: 'active', // active, resolved, expired
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Insert into database
    const { data: newItem, error } = await supabase
      .from('lost_found_items')
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
      console.error('❌ Database error creating item:', error);
      
      // Clean up uploaded images if database insertion fails
      if (imageUrls.length > 0) {
        try {
          const imagePaths = imageUrls.map(url => url.split('/lostfound-images/')[1]).filter(Boolean);
          if (imagePaths.length > 0) {
            await supabase.storage.from('lostfound-images').remove(imagePaths);
            console.log('🧹 Cleaned up uploaded images after database error');
          }
        } catch (cleanupError) {
          console.warn('⚠️ Failed to cleanup images after database error:', cleanupError);
        }
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to create item listing',
        details: error.message
      });
    }

    console.log('✅ Lost/Found item created successfully:', newItem.id);
    res.status(201).json({
      success: true,
      data: newItem,
      message: `${itemData.mode === 'lost' ? 'Lost' : 'Found'} item report created successfully`
    });

  } catch (error) {
    console.error('❌ Error in /create route:', error);

    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /api/lostfound - Fetch all lost/found items (PUBLIC with optional auth)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const userId = req.userId; // Will be null if not authenticated
    console.log('📋 Fetching lost/found items', userId ? `for user: ${userId}` : '(anonymous)');
    
    const {
      mode, // 'lost', 'found', or 'all'
      location,
      search,
      status = 'active',
      sort = 'created_at',
      order = 'desc',
      limit = 50,
      offset = 0
    } = req.query;

    let query = supabase
      .from('lost_found_items')
      .select(`
        *,
        users:user_id (
          id,
          name
        )
      `)
      .eq('status', status); // Only show active items by default

    // Apply filters
    if (mode && mode !== 'all' && ['lost', 'found'].includes(mode)) {
      query = query.eq('mode', mode);
    }
    
    if (location && location.trim()) {
      query = query.or(`where_last_seen.ilike.%${location.trim()}%,where_found.ilike.%${location.trim()}%`);
    }
    
    if (search && search.trim()) {
      query = query.or(`item_name.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%`);
    }

    // Apply sorting
    const validSortColumns = ['created_at', 'item_name', 'date_lost', 'date_found'];
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
      console.error('❌ Database error fetching items:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch items',
        details: error.message
      });
    }

    console.log(`✅ Fetched ${items?.length || 0} items`);
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
    console.error('❌ Error fetching items:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /api/lostfound/:id - Get single item details
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const itemId = req.params.id;
    const userId = req.userId; // Will be null if not authenticated
    console.log('🔍 Fetching item:', itemId, userId ? `by user: ${userId}` : '(anonymous)');

    const { data: item, error } = await supabase
      .from('lost_found_items')
      .select(`
        *,
        users:user_id (
          id,
          name,
          email
        )
      `)
      .eq('id', itemId)
      .eq('status', 'active') // Only show active items
      .single();

    if (error || !item) {
      console.log('❌ Item not found:', itemId);
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    console.log('✅ Item fetched successfully:', itemId);
    res.json({
      success: true,
      data: item
    });

  } catch (error) {
    console.error('❌ Error in /:id GET route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// PUT /api/lostfound/:id - Update item status (mark as resolved, etc.)
router.put('/:id', requireAuth, requireLostFoundOwnershipOrAdmin(), async (req, res) => {
  try {
    const itemId = req.params.id;
    const userId = req.userId;
    const { status, notes } = req.body;
    
    console.log('✏️ Updating item:', itemId, 'by user:', userId);

    // Validate status
    const validStatuses = ['active', 'resolved', 'expired'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: active, resolved, expired'
      });
    }

    // Prepare update data
    const updateData = {
      status: status,
      updated_at: new Date().toISOString()
    };

    if (notes && notes.trim()) {
      updateData.resolution_notes = notes.trim();
    }

    if (status === 'resolved') {
      updateData.resolved_at = new Date().toISOString();
    }

    // Update in database (ownership already verified by middleware)
    const { data: updatedItem, error } = await supabase
      .from('lost_found_items')
      .update(updateData)
      .eq('id', itemId)
      .eq('user_id', userId)
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
      console.error('❌ Database error updating item:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update item',
        details: error.message
      });
    }

    console.log('✅ Item updated successfully:', itemId);
    res.json({
      success: true,
      data: updatedItem,
      message: 'Item updated successfully'
    });

  } catch (error) {
    console.error('❌ Error in /:id PUT route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// DELETE /api/lostfound/:id - Delete item (Owner or Admin)
router.delete('/:id', requireAuth, requireLostFoundOwnershipOrAdmin(), async (req, res) => {
  try {
    const itemId = req.params.id;
    const userId = req.userId;
    console.log('🗑️ Deleting item:', itemId, 'by user:', userId);

    // Get item details before deletion (for cleanup and response)
    // Note: Ownership/admin access already verified by middleware
    const { data: existingItem, error: fetchError } = await supabase
      .from('lost_found_items')
      .select('item_name, image_urls')
      .eq('id', itemId)
      .single();

    if (fetchError || !existingItem) {
      console.error('❌ Error fetching item for deletion:', fetchError);
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    // Delete item from database (ownership/admin access already verified by middleware)
    const { error: deleteError } = await supabase
      .from('lost_found_items')
      .delete()
      .eq('id', itemId);

    if (deleteError) {
      console.error('❌ Database error deleting item:', deleteError);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete item',
        details: deleteError.message
      });
    }

    // Delete associated images from storage
    if (existingItem?.image_urls && existingItem.image_urls.length > 0) {
      try {
        const imagePaths = existingItem.image_urls
          .map(url => url.split('/lostfound-images/')[1])
          .filter(Boolean);
        
        if (imagePaths.length > 0) {
          await supabase.storage.from('lostfound-images').remove(imagePaths);
          console.log('🧹 Deleted associated images:', imagePaths.length);
        }
      } catch (imageError) {
        console.warn('⚠️ Failed to delete images:', imageError.message);
      }
    }

    console.log('✅ Item deleted successfully:', itemId);
    res.json({
      success: true,
      message: `Item "${existingItem.item_name}" deleted successfully`
    });

  } catch (error) {
    console.error('❌ Error in /:id DELETE route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// POST /api/lostfound/:id/contact - Send contact message about an item
router.post('/:id/contact', requireAuth, async (req, res) => {
  try {
    const itemId = req.params.id;
    const userId = req.userId;
    const { message, contactMethod } = req.body;
    console.log('💬 Creating contact request for item:', itemId, 'by user:', userId);

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // Check if item exists and is active
    const { data: item, error: itemError } = await supabase
      .from('lost_found_items')
      .select('user_id, item_name, status, mode')
      .eq('id', itemId)
      .single();

    if (itemError || !item) {
      console.log('❌ Item not found for contact:', itemId);
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    if (item.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'This item is no longer active'
      });
    }

    // Don't allow users to contact themselves
    if (item.user_id === userId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot contact yourself about your own item'
      });
    }

    // Create contact request
    const { data: contact, error } = await supabase
      .from('lostfound_contacts')
      .insert([{
        item_id: itemId,
        from_user_id: userId,
        to_user_id: item.user_id,
        message: message.trim(),
        contact_method: contactMethod || 'message',
        status: 'pending'
      }])
      .select(`
        *,
        from_user:from_user_id (
          id,
          name,
          email
        ),
        item:item_id (
          id,
          item_name,
          mode
        )
      `)
      .single();

    if (error) {
      console.error('❌ Error creating contact request:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to send contact request',
        details: error.message
      });
    }

    console.log('✅ Contact request created successfully:', contact.id);
    res.status(201).json({
      success: true,
      data: contact,
      message: 'Contact request sent successfully'
    });

  } catch (error) {
    console.error('❌ Error in /:id/contact route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /api/lostfound/stats - Get user's lost/found statistics
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    console.log('📊 Fetching stats for user:', userId);

    // Get item counts by status and mode
    const { data: items, error: itemsError } = await supabase
      .from('lost_found_items')
      .select('id, status, mode')
      .eq('user_id', userId);

    if (itemsError) {
      console.error('❌ Error fetching item stats:', itemsError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch statistics',
        details: itemsError.message
      });
    }

    const itemIds = items.map(item => item.id);

    // Get total contact requests
    const { count: contactCount } = await supabase
      .from('lostfound_contacts')
      .select('*', { count: 'exact', head: true })
      .in('item_id', itemIds);

    const stats = {
      lost_items: items.filter(item => item.mode === 'lost').length,
      found_items: items.filter(item => item.mode === 'found').length,
      active_items: items.filter(item => item.status === 'active').length,
      resolved_items: items.filter(item => item.status === 'resolved').length,
      total_items: items.length,
      total_contacts: contactCount || 0
    };

    console.log('✅ Stats calculated for user:', userId);
    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('❌ Error in /stats route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// Multer error handling middleware
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB per image.'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum 5 images allowed.'
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
// LOST & FOUND REQUEST SYSTEM
// ============================

// POST /api/lostfound/:id/request - Claim a found item or report seeing a lost item
router.post('/:id/request', requireAuth, async (req, res) => {
  try {
    const itemId = req.params.id;
    const userId = req.userId;
    const requestData = req.body;
    
    console.log('🔍 Creating lost/found request for item:', itemId, 'by user:', userId);

    // Validate request data
    const validationErrors = validateFoundItemRequestData(requestData);
    if (validationErrors.length > 0) {
      console.error('❌ Validation errors:', validationErrors);
      return res.status(400).json({
        success: false,
        message: validationErrors[0],
        errors: validationErrors
      });
    }

    // Check if item exists
    const { data: item, error: itemError } = await supabase
      .from('lost_found_items')
      .select('user_id, item_name, mode, status, description')
      .eq('id', itemId)
      .single();

    if (itemError || !item) {
      console.log('❌ Lost/found item not found for request:', itemId);
      return res.status(404).json({
        success: false,
        message: 'Lost/found item not found'
      });
    }

    // Check if user is trying to request their own item
    if (item.user_id === userId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot request your own lost/found item'
      });
    }

    // Check if item is still active
    if (item.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: `This ${item.mode} item is no longer active`
      });
    }

    // Check if user already has a request for this item
    const { data: existingRequest } = await supabase
      .from('lostfound_requests')
      .select('id, status')
      .eq('item_id', itemId)
      .eq('requester_id', userId)
      .single();

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: `You already have a ${existingRequest.status} request for this ${item.mode} item`
      });
    }

    // Create the lost/found request
    const dbRequestData = {
      item_id: itemId,
      requester_id: userId,
      owner_id: item.user_id,
      message: requestData.message.trim(),
      contact_method: requestData.contactMethod.trim(),
      proof_description: requestData.proofDescription?.trim() || null,
      status: 'pending', // pending, accepted, rejected, cancelled
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: newRequest, error } = await supabase
      .from('lostfound_requests')
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
          item_name,
          mode,
          status,
          description
        )
      `)
      .single();

    if (error) {
      console.error('❌ Database error creating lost/found request:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create lost/found request',
        details: error.message
      });
    }

    console.log('✅ Lost/found request created successfully:', newRequest.id);
    res.status(201).json({
      success: true,
      message: `${item.mode === 'lost' ? 'Sighting report' : 'Claim request'} sent successfully`,
      data: newRequest
    });

  } catch (e) {
    console.error('❌ Error creating lost/found request:', e);
    res.status(500).json({ 
      success: false,
      message: 'Failed to create lost/found request',
      error: e.message 
    });
  }
});

// GET /api/lostfound/my/requests - Get requests that users made TO MY items (requests I received as owner)
router.get('/my/requests', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    console.log('📋 Fetching requests received on my lost/found items by user:', userId);

    // First get the user's item IDs
    const { data: userItems, error: itemsError } = await supabase
      .from('lost_found_items')
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
        message: 'No requests found (you have no lost/found items posted)'
      });
    }

    const itemIds = userItems.map(item => item.id);

    // Get all requests for these specific items only
    const { data: requests, error } = await supabase
      .from('lostfound_requests')
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
          item_name,
          mode,
          status,
          description,
          where_last_seen,
          where_found,
          date_lost,
          date_found,
          user_id,
          image_urls
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

    console.log(`📊 Found ${filteredRequests.length} requests on user's lost/found items`);

    res.json({
      success: true,
      data: filteredRequests,
      count: filteredRequests.length
    });

  } catch (e) {
    console.error('❌ Error fetching lost/found requests:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch lost/found requests',
      error: e.message
    });
  }
});

// GET /api/lostfound/requests/sent - Get requests that I sent (as a claimant/reporter)
router.get('/requests/sent', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    console.log('📋 Fetching lost/found requests sent by user:', userId);

    const { data: requests, error } = await supabase
      .from('lostfound_requests')
      .select(`
        *,
        item:item_id (
          id,
          item_name,
          mode,
          status,
          description,
          where_last_seen,
          where_found,
          image_urls
        ),
        owner:owner_id (
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
    console.error('❌ Error fetching sent lost/found requests:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sent lost/found requests',
      error: e.message
    });
  }
});

// PUT /api/lostfound/requests/:requestId/respond - Respond to a lost/found request (for owners)
router.put('/requests/:requestId/respond', requireAuth, async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const userId = req.userId;
    const { status, responseMessage } = req.body;

    console.log('📝 Responding to lost/found request:', requestId, 'with status:', status);

    // Validate status
    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be "accepted" or "rejected"'
      });
    }

    // Get the request and verify ownership
    const { data: request, error: requestError } = await supabase
      .from('lostfound_requests')
      .select(`
        *,
        item:item_id (
          id,
          item_name,
          mode,
          user_id
        )
      `)
      .eq('id', requestId)
      .single();

    if (requestError || !request) {
      console.log('❌ Lost/found request not found:', requestId);
      return res.status(404).json({
        success: false,
        message: 'Lost/found request not found'
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
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: updatedRequest, error: updateError } = await supabase
      .from('lostfound_requests')
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
          item_name,
          mode,
          description
        )
      `)
      .single();

    if (updateError) {
      console.error('❌ Database error updating lost/found request:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to update lost/found request',
        details: updateError.message
      });
    }

    // If accepted, update the item status to resolved
    if (status === 'accepted') {
      const { error: itemUpdateError } = await supabase
        .from('lost_found_items')
        .update({ 
          status: 'resolved',
          updated_at: new Date().toISOString()
        })
        .eq('id', request.item_id);

      if (itemUpdateError) {
        console.error('❌ Error updating item status to resolved:', itemUpdateError);
        // Don't fail the request response, just log the error
      }
    }

    console.log(`✅ Lost/found request ${status} successfully`);
    res.json({
      success: true,
      message: `${request.item.mode === 'lost' ? 'Sighting report' : 'Claim request'} ${status} successfully`,
      data: updatedRequest
    });

  } catch (e) {
    console.error('❌ Error responding to lost/found request:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to respond to lost/found request',
      error: e.message
    });
  }
});

// DELETE /api/lostfound/requests/:requestId - Cancel a lost/found request (for claimants/reporters)
router.delete('/requests/:requestId', requireAuth, async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const userId = req.userId;

    console.log('🗑️ Cancelling lost/found request:', requestId, 'by user:', userId);

    // Get the request and verify ownership
    const { data: request, error: requestError } = await supabase
      .from('lostfound_requests')
      .select('id, requester_id, status, item:item_id(mode)')
      .eq('id', requestId)
      .single();

    if (requestError || !request) {
      console.log('❌ Lost/found request not found:', requestId);
      return res.status(404).json({
        success: false,
        message: 'Lost/found request not found'
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
        message: 'Cannot cancel an accepted request. Please contact the item owner.'
      });
    }

    // Update status to cancelled instead of deleting
    const { error: updateError } = await supabase
      .from('lostfound_requests')
      .update({ 
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', requestId);

    if (updateError) {
      console.error('❌ Database error cancelling lost/found request:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to cancel lost/found request',
        details: updateError.message
      });
    }

    console.log('✅ Lost/found request cancelled successfully');
    res.json({
      success: true,
      message: `${request.item?.mode === 'lost' ? 'Sighting report' : 'Claim request'} cancelled successfully`
    });

  } catch (e) {
    console.error('❌ Error cancelling lost/found request:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel lost/found request',
      error: e.message
    });
  }
});

module.exports = router;