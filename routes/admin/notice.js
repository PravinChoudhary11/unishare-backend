// routes/admin/notice.js - Admin notice management (all data access)
const express = require('express');
const router = express.Router();
const requireAdmin = require('../../middleware/requireAdmin');
const supabase = require('../../config/supabase');

// GET /admin/notice - Get all notices (admin view)
router.get('/', requireAdmin, async (req, res) => {
  try {
    console.log('👑 Admin fetching all notices:', req.user.email);

    const { data: notices, error } = await supabase
      .from('notices')
      .select(`
        *,
        users:user_id (
          id,
          name,
          email
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch notices',
        details: error.message
      });
    }

    console.log(`✅ Admin fetched ${notices?.length || 0} notices`);
    
    res.json({
      success: true,
      data: notices || [],
      message: `Found ${notices?.length || 0} notices`,
      requestedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin get notices route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /admin/notice/:id - Get specific notice (admin view)
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const noticeId = req.params.id;
    console.log('👑 Admin fetching notice:', noticeId);

    const { data: notice, error } = await supabase
      .from('notices')
      .select(`
        *,
        users:user_id (
          id,
          name,
          email
        )
      `)
      .eq('id', noticeId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Notice not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch notice',
        details: error.message
      });
    }

    console.log('✅ Admin fetched notice:', noticeId);
    
    res.json({
      success: true,
      data: notice
    });

  } catch (error) {
    console.error('❌ Error in admin get notice route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// POST /admin/notice - Admin create notice (can specify any user)
router.post('/', requireAdmin, async (req, res) => {
  try {
    console.log('👑 Admin creating notice:', req.user.email);

    const noticeData = {
      ...req.body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: notice, error } = await supabase
      .from('notices')
      .insert([noticeData])
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
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create notice',
        details: error.message
      });
    }

    console.log('✅ Admin created notice successfully:', notice.id);
    
    res.status(201).json({
      success: true,
      data: notice,
      message: 'Notice created successfully',
      createdBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin create notice route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// PUT /admin/notice/:id - Admin update any notice
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const noticeId = req.params.id;
    console.log('👑 Admin updating notice:', noticeId, 'by:', req.user.email);

    const updateData = {
      ...req.body,
      updated_at: new Date().toISOString()
    };

    const { data: updatedNotice, error } = await supabase
      .from('notices')
      .update(updateData)
      .eq('id', noticeId)
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
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Notice not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update notice',
        details: error.message
      });
    }

    console.log('✅ Admin updated notice successfully:', noticeId);
    
    res.json({
      success: true,
      data: updatedNotice,
      message: 'Notice updated successfully',
      updatedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin update notice route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// DELETE /admin/notice/:id - Admin delete any notice
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const noticeId = req.params.id;
    console.log('👑 Admin deleting notice:', noticeId, 'by:', req.user.email);

    const { data: deletedNotice, error } = await supabase
      .from('notices')
      .delete()
      .eq('id', noticeId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Notice not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete notice',
        details: error.message
      });
    }

    console.log('✅ Admin deleted notice successfully:', noticeId);
    
    res.json({
      success: true,
      message: 'Notice deleted successfully',
      data: deletedNotice,
      deletedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin delete notice route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

module.exports = router;