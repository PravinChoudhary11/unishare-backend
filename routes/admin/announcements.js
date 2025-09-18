// routes/admin/announcements.js - Admin announcements management (all data access)
const express = require('express');
const router = express.Router();
const requireAdmin = require('../../middleware/requireAdmin');
const supabase = require('../../config/supabase');

// GET /admin/announcements - Get all announcements (admin view)
router.get('/', requireAdmin, async (req, res) => {
  try {
    console.log('👑 Admin fetching all announcements:', req.user.email);

    const { data: announcements, error } = await supabase
      .from('announcements')
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
        message: 'Failed to fetch announcements',
        details: error.message
      });
    }

    console.log(`✅ Admin fetched ${announcements?.length || 0} announcements`);
    
    res.json({
      success: true,
      data: announcements || [],
      message: `Found ${announcements?.length || 0} announcements`,
      requestedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin get announcements route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /admin/announcements/:id - Get specific announcement (admin view)
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const announcementId = req.params.id;
    console.log('👑 Admin fetching announcement:', announcementId);

    const { data: announcement, error } = await supabase
      .from('announcements')
      .select(`
        *,
        users:user_id (
          id,
          name,
          email
        )
      `)
      .eq('id', announcementId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Announcement not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch announcement',
        details: error.message
      });
    }

    console.log('✅ Admin fetched announcement:', announcementId);
    
    res.json({
      success: true,
      data: announcement
    });

  } catch (error) {
    console.error('❌ Error in admin get announcement route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// POST /admin/announcements - Admin create announcement (can specify any user)
router.post('/', requireAdmin, async (req, res) => {
  try {
    console.log('👑 Admin creating announcement:', req.user.email);

    const announcementData = {
      ...req.body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: announcement, error } = await supabase
      .from('announcements')
      .insert([announcementData])
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
        message: 'Failed to create announcement',
        details: error.message
      });
    }

    console.log('✅ Admin created announcement successfully:', announcement.id);
    
    res.status(201).json({
      success: true,
      data: announcement,
      message: 'Announcement created successfully',
      createdBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin create announcement route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// PUT /admin/announcements/:id - Admin update any announcement
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const announcementId = req.params.id;
    console.log('👑 Admin updating announcement:', announcementId, 'by:', req.user.email);

    const updateData = {
      ...req.body,
      updated_at: new Date().toISOString()
    };

    const { data: updatedAnnouncement, error } = await supabase
      .from('announcements')
      .update(updateData)
      .eq('id', announcementId)
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
          message: 'Announcement not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update announcement',
        details: error.message
      });
    }

    console.log('✅ Admin updated announcement successfully:', announcementId);
    
    res.json({
      success: true,
      data: updatedAnnouncement,
      message: 'Announcement updated successfully',
      updatedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin update announcement route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// DELETE /admin/announcements/:id - Admin delete any announcement
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const announcementId = req.params.id;
    console.log('👑 Admin deleting announcement:', announcementId, 'by:', req.user.email);

    const { data: deletedAnnouncement, error } = await supabase
      .from('announcements')
      .delete()
      .eq('id', announcementId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Announcement not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete announcement',
        details: error.message
      });
    }

    console.log('✅ Admin deleted announcement successfully:', announcementId);
    
    res.json({
      success: true,
      message: 'Announcement deleted successfully',
      data: deletedAnnouncement,
      deletedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin delete announcement route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

module.exports = router;