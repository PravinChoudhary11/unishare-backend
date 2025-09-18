// routes/admin/resources.js - Admin resources management (all data access)
const express = require('express');
const router = express.Router();
const requireAdmin = require('../../middleware/requireAdmin');
const supabase = require('../../config/supabase');

// GET /admin/resources - Get all resources (admin view)
router.get('/', requireAdmin, async (req, res) => {
  try {
    console.log('👑 Admin fetching all resources:', req.user.email);

    const { data: resources, error } = await supabase
      .from('resources')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch resources',
        details: error.message
      });
    }

    console.log(`✅ Admin fetched ${resources?.length || 0} resources`);
    
    res.json({
      success: true,
      data: resources || [],
      message: `Found ${resources?.length || 0} resources`,
      requestedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin get resources route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /admin/resources/:id - Get specific resource (admin view)
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const resourceId = req.params.id;
    console.log('👑 Admin fetching resource:', resourceId);

    const { data: resource, error } = await supabase
      .from('resources')
      .select('*')
      .eq('id', resourceId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Resource not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch resource',
        details: error.message
      });
    }

    console.log('✅ Admin fetched resource:', resourceId);
    
    res.json({
      success: true,
      data: resource
    });

  } catch (error) {
    console.error('❌ Error in admin get resource route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// POST /admin/resources - Admin create resource (can specify any user)
router.post('/', requireAdmin, async (req, res) => {
  try {
    console.log('👑 Admin creating resource:', req.user.email);

    const resourceData = {
      ...req.body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: resource, error } = await supabase
      .from('resources')
      .insert([resourceData])
      .select('*')
      .single();

    if (error) {
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create resource',
        details: error.message
      });
    }

    console.log('✅ Admin created resource successfully:', resource.id);
    
    res.status(201).json({
      success: true,
      data: resource,
      message: 'Resource created successfully',
      createdBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin create resource route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// PUT /admin/resources/:id - Admin update any resource
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const resourceId = req.params.id;
    console.log('👑 Admin updating resource:', resourceId, 'by:', req.user.email);

    const updateData = {
      ...req.body,
      updated_at: new Date().toISOString()
    };

    const { data: updatedResource, error } = await supabase
      .from('resources')
      .update(updateData)
      .eq('id', resourceId)
      .select('*')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Resource not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update resource',
        details: error.message
      });
    }

    console.log('✅ Admin updated resource successfully:', resourceId);
    
    res.json({
      success: true,
      data: updatedResource,
      message: 'Resource updated successfully',
      updatedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin update resource route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// DELETE /admin/resources/:id - Admin delete any resource
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const resourceId = req.params.id;
    console.log('👑 Admin deleting resource:', resourceId, 'by:', req.user.email);

    const { data: deletedResource, error } = await supabase
      .from('resources')
      .delete()
      .eq('id', resourceId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Resource not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete resource',
        details: error.message
      });
    }

    console.log('✅ Admin deleted resource successfully:', resourceId);
    
    res.json({
      success: true,
      message: 'Resource deleted successfully',
      data: deletedResource,
      deletedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin delete resource route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// PATCH /admin/resources/:id/toggle - Toggle resource active status (admin only)
router.patch('/:id/toggle', requireAdmin, async (req, res) => {
  try {
    const resourceId = req.params.id;
    console.log('👑 Admin toggling resource active status:', resourceId, 'by:', req.user.email);

    // First, get the current resource to check its status
    const { data: currentResource, error: fetchError } = await supabase
      .from('resources')
      .select('active')
      .eq('id', resourceId)
      .single();

    if (fetchError || !currentResource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found'
      });
    }

    // Toggle the active status
    const newActiveStatus = !currentResource.active;

    const { data: updatedResource, error } = await supabase
      .from('resources')
      .update({ active: newActiveStatus })
      .eq('id', resourceId)
      .select('*')
      .single();

    if (error) {
      console.error('❌ Database error toggling resource:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to toggle resource status',
        details: error.message
      });
    }

    const statusText = newActiveStatus ? 'activated' : 'deactivated';
    console.log(`✅ Admin ${statusText} resource:`, resourceId);
    
    res.json({
      success: true,
      data: updatedResource,
      resource: updatedResource,
      message: `Resource ${statusText} successfully`,
      requestedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin toggle resource route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

module.exports = router;