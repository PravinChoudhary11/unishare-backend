// routes/api/announcements.js - Public announcements API
const express = require('express');
const router = express.Router();
const supabase = require('../../config/supabase');
const { requireAuth } = require('../../middleware/requireAuth');

// GET /api/announcements - Get active announcements (public access)
router.get('/', async (req, res) => {
  try {
    const { data: announcements, error } = await supabase
      .from('announcements')
      .select('id, title, body, priority, tags, created_at')
      .eq('active', true)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch announcements',
        details: error.message
      });
    }

    res.json({
      success: true,
      data: announcements || [],
      message: `Found ${announcements?.length || 0} announcements`
    });

  } catch (error) {
    console.error('❌ Error in get announcements route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /api/announcements/my - Get my submitted announcements (authenticated users)
router.get('/my', async (req, res) => {
  try {
    // Check authentication
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const { data: announcements, error } = await supabase
      .from('announcements')
      .select('id, title, body, tags, priority, active, created_at, updated_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Database error fetching user announcements:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch announcements',
        details: error.message
      });
    }

    res.json({
      success: true,
      data: announcements || [],
      message: `Found ${announcements?.length || 0} announcements`
    });

  } catch (error) {
    console.error('❌ Error in get my announcements route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /api/announcements/:id - Get specific announcement (public access)
router.get('/:id', async (req, res) => {
  try {
    const announcementId = req.params.id;

    // Validate that ID is numeric
    if (!/^\d+$/.test(announcementId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid announcement ID format. ID must be numeric.'
      });
    }

    const { data: announcement, error } = await supabase
      .from('announcements')
      .select('id, title, body, priority, tags, created_at')
      .eq('id', announcementId)
      .eq('active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Announcement not found or not active'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch announcement',
        details: error.message
      });
    }

    res.json({
      success: true,
      data: announcement
    });

  } catch (error) {
    console.error('❌ Error in get announcement route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// POST /api/announcements - Submit new announcement (authenticated users)
router.post('/', async (req, res) => {
  try {
    // Check authentication
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to submit announcements'
      });
    }

    const { title, body, tags = ['general'], priority = 'normal' } = req.body;

    // Validate required fields
    if (!title || !body) {
      return res.status(400).json({
        success: false,
        message: 'Title and body are required'
      });
    }

    // Validate field lengths
    if (title.length > 200) {
      return res.status(400).json({
        success: false,
        message: 'Title must be 200 characters or less'
      });
    }

    if (body.length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'Body must be 2000 characters or less'
      });
    }

    // Validate priority
    const validPriorities = ['high', 'normal', 'low'];
    if (priority && !validPriorities.includes(priority)) {
      return res.status(400).json({
        success: false,
        message: 'Priority must be one of: high, normal, low'
      });
    }

    // Validate tags array
    let processedTags = tags;
    if (typeof tags === 'string') {
      // Convert single string to array or split comma-separated values
      processedTags = tags.includes(',') ? tags.split(',').map(tag => tag.trim()) : [tags.trim()];
    } else if (Array.isArray(tags)) {
      // Validate array items are strings
      processedTags = tags.filter(tag => typeof tag === 'string' && tag.trim().length > 0)
                          .map(tag => tag.trim());
    } else {
      processedTags = ['general'];
    }

    // Ensure we have at least one tag
    if (!processedTags || processedTags.length === 0) {
      processedTags = ['general'];
    }

    const announcementData = {
      title: title.trim(),
      body: body.trim(),
      tags: processedTags,
      priority,
      user_id: req.user.id,
      active: false // User submissions start inactive until admin approval
    };

    const { data: announcement, error } = await supabase
      .from('announcements')
      .insert(announcementData)
      .select()
      .single();

    if (error) {
      console.error('❌ Database error creating announcement:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create announcement',
        details: error.message
      });
    }

    res.status(201).json({
      success: true,
      data: announcement,
      message: 'Announcement submitted successfully. It will be visible once approved by admin.'
    });

  } catch (error) {
    console.error('❌ Error in create announcement route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// PUT /api/announcements/:id - Update my announcement (authenticated users)
router.put('/:id', async (req, res) => {
  try {
    // Check authentication
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const announcementId = req.params.id;
    const { title, body, tags, priority } = req.body;

    // Validate ID format
    if (!/^\d+$/.test(announcementId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid announcement ID format'
      });
    }

    // Check ownership
    const { data: existing, error: fetchError } = await supabase
      .from('announcements')
      .select('user_id, active')
      .eq('id', announcementId)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    if (existing.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own announcements'
      });
    }

    // Prepare update data
    const updateData = {};

    if (title !== undefined) {
      if (!title.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Title is required'
        });
      }
      updateData.title = title.trim();
    }

    if (body !== undefined) {
      if (!body.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Body is required'
        });
      }
      updateData.body = body.trim();
    }

    if (tags !== undefined) {
      let processedTags = tags;
      if (typeof tags === 'string') {
        // Convert single string to array or split comma-separated values
        processedTags = tags.includes(',') ? tags.split(',').map(tag => tag.trim()) : [tags.trim()];
      } else if (Array.isArray(tags)) {
        // Validate array items are strings
        processedTags = tags.filter(tag => typeof tag === 'string' && tag.trim().length > 0)
                            .map(tag => tag.trim());
      } else {
        processedTags = ['general'];
      }
      
      // Ensure we have at least one tag
      if (!processedTags || processedTags.length === 0) {
        processedTags = ['general'];
      }
      
      updateData.tags = processedTags;
    }
    
    if (priority !== undefined) {
      const validPriorities = ['high', 'normal', 'low'];
      if (!validPriorities.includes(priority)) {
        return res.status(400).json({
          success: false,
          message: 'Priority must be one of: high, normal, low'
        });
      }
      updateData.priority = priority;
    }
    


    const { data: announcement, error } = await supabase
      .from('announcements')
      .update(updateData)
      .eq('id', announcementId)
      .select()
      .single();

    if (error) {
      console.error('❌ Database error updating announcement:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update announcement',
        details: error.message
      });
    }

    res.json({
      success: true,
      data: announcement,
      message: 'Announcement updated successfully'
    });

  } catch (error) {
    console.error('❌ Error in update announcement route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// DELETE /api/announcements/:id - Delete my announcement (authenticated users)
router.delete('/:id', async (req, res) => {
  try {
    // Check authentication
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const announcementId = req.params.id;

    // Validate ID format
    if (!/^\d+$/.test(announcementId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid announcement ID format'
      });
    }

    // Check ownership
    const { data: existing, error: fetchError } = await supabase
      .from('announcements')
      .select('user_id')
      .eq('id', announcementId)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    if (existing.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own announcements'
      });
    }

    const { error } = await supabase
      .from('announcements')
      .delete()
      .eq('id', announcementId);

    if (error) {
      console.error('❌ Database error deleting announcement:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete announcement',
        details: error.message
      });
    }

    res.json({
      success: true,
      message: 'Announcement deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error in delete announcement route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

module.exports = router;