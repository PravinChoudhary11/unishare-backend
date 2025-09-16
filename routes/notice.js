// routes/notice.js - Notice management routes
const express = require('express');
const router = express.Router();
const requireAdmin = require('../middleware/requireAdmin');

// Public route - Get active notices (no authentication required)
router.get('/', async (req, res) => {
  try {
    console.log('📢 Public fetching active notices');

    // Import supabase here to avoid circular dependencies
    const supabase = require('../config/supabase');

    const { data: notices, error } = await supabase
      .from('notices')
      .select('id, heading, body, priority, created_at')
      .eq('active', true)
      .order('priority', { ascending: false }) // Show high priority first
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Database error fetching public notices:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch notices',
        details: error.message
      });
    }

    console.log(`✅ Public fetched ${notices?.length || 0} active notices`);
    
    res.json({
      success: true,
      notices: notices || [],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in public notices route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// Admin route - Get all notices (including inactive)
router.get('/admin', requireAdmin, async (req, res) => {
  try {
    console.log('📢 Admin fetching notices:', req.user.email);

    // Import supabase here to avoid circular dependencies
    const supabase = require('../config/supabase');

    const { data: notices, error } = await supabase
      .from('notices')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Database error fetching notices:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch notices',
        details: error.message
      });
    }

    console.log(`✅ Admin fetched ${notices?.length || 0} notices`);
    
    res.json({
      success: true,
      message: `Found ${notices?.length || 0} notices`,
      notices: notices || [],
      requestedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in get notices route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// Admin route - Create new notice
router.post('/admin', requireAdmin, async (req, res) => {
  try {
    const { heading, body, active = true, priority = 'normal' } = req.body;

    // Validation
    if (!heading || !body) {
      return res.status(400).json({
        success: false,
        message: 'Heading and body are required'
      });
    }

    console.log('📢 Admin creating notice:', req.user.email);

    // Import supabase here to avoid circular dependencies
    const supabase = require('../config/supabase');

    const { data: notice, error } = await supabase
      .from('notices')
      .insert([{
        heading: heading.trim(),
        body: body.trim(),
        active: active,
        priority: priority,
        user_id: req.user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error('❌ Database error creating notice:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create notice',
        details: error.message
      });
    }

    console.log('✅ Notice created successfully:', notice.id);
    
    res.status(201).json({
      success: true,
      message: 'Notice created successfully',
      notice: notice,
      createdBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in create notice route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// Admin route - Update existing notice
router.patch('/admin/:id', requireAdmin, async (req, res) => {
  try {
    const noticeId = req.params.id;
    const { heading, body, active, priority } = req.body;

    console.log('📢 Admin updating notice:', noticeId, 'by:', req.user.email);

    // Import supabase here to avoid circular dependencies
    const supabase = require('../config/supabase');

    // Build update object with only provided fields
    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (heading !== undefined) updateData.heading = heading.trim();
    if (body !== undefined) updateData.body = body.trim();
    if (active !== undefined) updateData.active = active;
    if (priority !== undefined) updateData.priority = priority;

    const { data: updatedNotice, error } = await supabase
      .from('notices')
      .update(updateData)
      .eq('id', noticeId)
      .select()
      .single();

    if (error) {
      console.error('❌ Database error updating notice:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update notice',
        details: error.message
      });
    }

    if (!updatedNotice) {
      return res.status(404).json({
        success: false,
        message: 'Notice not found'
      });
    }

    console.log('✅ Notice updated successfully:', noticeId);
    
    res.json({
      success: true,
      message: 'Notice updated successfully',
      notice: updatedNotice,
      updatedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in update notice route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// Admin route - Delete notice
router.delete('/admin/:id', requireAdmin, async (req, res) => {
  try {
    const noticeId = req.params.id;

    console.log('📢 Admin deleting notice:', noticeId, 'by:', req.user.email);

    // Import supabase here to avoid circular dependencies
    const supabase = require('../config/supabase');

    const { data: deletedNotice, error } = await supabase
      .from('notices')
      .delete()
      .eq('id', noticeId)
      .select()
      .single();

    if (error) {
      console.error('❌ Database error deleting notice:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete notice',
        details: error.message
      });
    }

    if (!deletedNotice) {
      return res.status(404).json({
        success: false,
        message: 'Notice not found'
      });
    }

    console.log('✅ Notice deleted successfully:', noticeId);
    
    res.json({
      success: true,
      message: 'Notice deleted successfully',
      notice: deletedNotice,
      deletedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in delete notice route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});



module.exports = router;