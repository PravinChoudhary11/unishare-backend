// routes/api/resources.js - Public resources API + user suggestions
const express = require('express');
const router = express.Router();
const supabase = require('../../config/supabase');
const { requireAuth } = require('../../middleware/requireAuth');

// GET /api/resources - Get active resources (public access)
router.get('/', async (req, res) => {
  try {
    console.log('📚 Fetching public resources');

    const { category } = req.query;
    
    let query = supabase
      .from('resources')
      .select('id, title, desc, url, category, type, tags, created_at')
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (category) {
      query = query.eq('category', category);
    }

    const { data: resources, error } = await query;

    if (error) {
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch resources',
        details: error.message
      });
    }

    console.log(`✅ Fetched ${resources?.length || 0} active resources`);
    
    res.json({
      success: true,
      data: resources || [],
      message: `Found ${resources?.length || 0} resources`
    });

  } catch (error) {
    console.error('❌ Error in get resources route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /api/resources/my - Get user's own resource suggestions
router.get('/my', requireAuth, async (req, res) => {
  try {
    console.log('📚 User fetching own resource suggestions:', req.user.id);

    const { data: resources, error } = await supabase
      .from('resources')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch your resources',
        details: error.message
      });
    }

    console.log(`✅ User fetched ${resources?.length || 0} own resource suggestions`);
    
    res.json({
      success: true,
      data: resources || [],
      message: `Found ${resources?.length || 0} resource suggestions`
    });

  } catch (error) {
    console.error('❌ Error in get user resources route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /api/resources/categories - Get unique resource categories
router.get('/categories', async (req, res) => {
  try {
    console.log('📚 Fetching public resource: categories');

    const { data: resources, error } = await supabase
      .from('resources')
      .select('category')
      .eq('active', true);

    if (error) {
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch resource categories',
        details: error.message
      });
    }

    // Extract unique categories
    const categories = [...new Set(resources.map(r => r.category))].filter(Boolean);
    
    res.json({
      success: true,
      data: categories,
      message: `Found ${categories.length} resource categories`
    });

  } catch (error) {
    console.error('❌ Error in get resource categories route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /api/resources/:id - Get specific resource (public access)
router.get('/:id', async (req, res) => {
  try {
    const resourceId = req.params.id;
    console.log('📚 Fetching public resource:', resourceId);

    const { data: resource, error } = await supabase
      .from('resources')
      .select('id, title, desc, url, category, type, tags, created_at')
      .eq('id', resourceId)
      .eq('active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Resource not found or not active'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch resource',
        details: error.message
      });
    }

    console.log('✅ Fetched public resource:', resourceId);
    
    res.json({
      success: true,
      data: resource
    });

  } catch (error) {
    console.error('❌ Error in get resource route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// POST /api/resources/suggest - Submit resource suggestion (authenticated users)
router.post('/suggest', requireAuth, async (req, res) => {
  try {
    console.log('📚 User submitting resource suggestion:', req.user.id);

    const resourceData = {
      ...req.body,
      active: false // Requires admin approval
    };

    const { data: resource, error } = await supabase
      .from('resources')
      .insert([resourceData])
      .select()
      .single();

    if (error) {
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to submit resource suggestion',
        details: error.message
      });
    }

    console.log('✅ Resource suggestion submitted:', resource.id);
    
    res.status(201).json({
      success: true,
      data: resource,
      message: 'Resource suggestion submitted successfully. It will be reviewed by administrators.'
    });

  } catch (error) {
    console.error('❌ Error in submit resource suggestion route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// PUT /api/resources/my/:id - Update user's own resource suggestion
router.put('/my/:id', requireAuth, async (req, res) => {
  try {
    const resourceId = req.params.id;
    console.log('📚 User updating own resource suggestion:', resourceId);

    const updateData = {
      ...req.body,
      updated_at: new Date().toISOString()
    };

    // Remove fields users shouldn't be able to modify
    delete updateData.user_id;
    delete updateData.active;

    const { data: updatedResource, error } = await supabase
      .from('resources')
      .update(updateData)
      .eq('id', resourceId)
      .eq('user_id', req.user.id) // Can only update own suggestions
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Resource suggestion not found or access denied'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update resource suggestion',
        details: error.message
      });
    }

    console.log('✅ User resource suggestion updated:', resourceId);
    
    res.json({
      success: true,
      data: updatedResource,
      message: 'Resource suggestion updated successfully'
    });

  } catch (error) {
    console.error('❌ Error in update resource suggestion route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// DELETE /api/resources/my/:id - Delete user's own resource suggestion
router.delete('/my/:id', requireAuth, async (req, res) => {
  try {
    const resourceId = req.params.id;
    console.log('📚 User deleting own resource suggestion:', resourceId);

    const { data: deletedResource, error } = await supabase
      .from('resources')
      .delete()
      .eq('id', resourceId)
      .eq('user_id', req.user.id) // Can only delete own suggestions
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Resource suggestion not found or access denied'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete resource suggestion',
        details: error.message
      });
    }

    console.log('✅ User resource suggestion deleted:', resourceId);
    
    res.json({
      success: true,
      message: 'Resource suggestion deleted successfully',
      data: deletedResource
    });

  } catch (error) {
    console.error('❌ Error in delete resource suggestion route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

module.exports = router;