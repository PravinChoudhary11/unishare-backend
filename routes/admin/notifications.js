// routes/admin/notifications.js - Admin notifications management
const express = require('express');
const router = express.Router();
const requireAdmin = require('../../middleware/requireAdmin');
const supabase = require('../../config/supabase');

// POST /admin/notifications - Send notification to users
router.post('/', requireAdmin, async (req, res) => {
  try {
    console.log('👑 Admin sending notification:', req.user.email);

    const { users, message, type = 'info', title } = req.body;

    // Validate required fields
    if (!users || !Array.isArray(users) || users.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Users array is required and must not be empty'
      });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // Validate type
    const validTypes = ['info', 'success', 'warning', 'error'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Type must be one of: info, success, warning, error'
      });
    }

    const notifications = [];
    const currentTime = new Date().toISOString();

    // Handle different audience types
    for (const user of users) {
      if (user === 'ALL') {
        // Send to all users - create a global notification
        notifications.push({
          title: title?.trim() || null,
          message: message.trim(),
          type,
          recipient_type: 'all',
          recipient_id: null,
          sender_id: req.user.id,
          read: false,
          created_at: currentTime,
          updated_at: currentTime
        });
      } else if (user === 'SELF') {
        // Send to admin themselves (for testing)
        notifications.push({
          title: title?.trim() || null,
          message: message.trim(),
          type,
          recipient_type: 'user',
          recipient_id: req.user.id,
          sender_id: req.user.id,
          read: false,
          created_at: currentTime,
          updated_at: currentTime
        });
      } else {
        // Send to specific user by email
        // First, find the user by email
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id')
          .eq('email', user.trim())
          .maybeSingle(); // Use maybeSingle to handle no results gracefully

        if (userError) {
          console.error(`❌ Database error looking up user ${user}:`, userError);
          continue;
        }

        if (!userData) {
          console.warn(`⚠️ User not found for email: ${user}`);
          // Continue with other users, don't fail the whole request
          continue;
        }

        notifications.push({
          title: title?.trim() || null,
          message: message.trim(),
          type,
          recipient_type: 'user',
          recipient_id: userData.id,
          sender_id: req.user.id,
          read: false,
          created_at: currentTime,
          updated_at: currentTime
        });
      }
    }

    if (notifications.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid recipients found'
      });
    }

    // Insert all notifications
    const { data: createdNotifications, error } = await supabase
      .from('notifications')
      .insert(notifications)
      .select();

    if (error) {
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to send notifications',
        details: error.message
      });
    }

    console.log(`✅ Admin sent ${createdNotifications?.length || 0} notifications`);
    
    res.status(201).json({
      success: true,
      data: createdNotifications,
      message: `Successfully sent ${createdNotifications?.length || 0} notifications`,
      sentBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin send notification route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /admin/notifications - Get all notifications (admin view)
router.get('/', requireAdmin, async (req, res) => {
  try {
    console.log('👑 Admin fetching all notifications:', req.user.email);

    const { limit = 100, type, recipient_type } = req.query;

    let query = supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    // Apply filters
    if (type && type !== 'all') {
      query = query.eq('type', type);
    }

    if (recipient_type && recipient_type !== 'all') {
      query = query.eq('recipient_type', recipient_type);
    }

    const { data: notifications, error } = await query;

    if (error) {
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch notifications',
        details: error.message
      });
    }

    console.log(`✅ Admin fetched ${notifications?.length || 0} notifications`);
    
    res.json({
      success: true,
      data: notifications || [],
      message: `Found ${notifications?.length || 0} notifications`,
      requestedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin get notifications route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /admin/notifications/:id - Get specific notification (admin view)
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const notificationId = req.params.id;
    console.log('👑 Admin fetching notification:', notificationId);

    // Validate ID format
    if (!/^\d+$/.test(notificationId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification ID format'
      });
    }

    const { data: notification, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('id', notificationId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch notification',
        details: error.message
      });
    }

    console.log('✅ Admin fetched notification:', notificationId);
    
    res.json({
      success: true,
      data: notification,
      requestedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin get notification route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// DELETE /admin/notifications/:id - Delete notification (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const notificationId = req.params.id;
    console.log('👑 Admin deleting notification:', notificationId, 'by:', req.user.email);

    // Validate ID format
    if (!/^\d+$/.test(notificationId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification ID format'
      });
    }

    const { data: deletedNotification, error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete notification',
        details: error.message
      });
    }

    console.log('✅ Admin deleted notification:', notificationId);
    
    res.json({
      success: true,
      data: deletedNotification,
      message: 'Notification deleted successfully',
      deletedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin delete notification route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /admin/notifications/stats - Get notification statistics
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    console.log('👑 Admin fetching notification stats:', req.user.email);

    // Get total notifications count
    const { count: totalCount, error: totalError } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true });

    if (totalError) {
      console.error('❌ Database error:', totalError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch notification stats',
        details: totalError.message
      });
    }

    // Get unread notifications count
    const { count: unreadCount, error: unreadError } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('read', false);

    if (unreadError) {
      console.error('❌ Database error:', unreadError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch unread stats',
        details: unreadError.message
      });
    }

    // Get notifications by type
    const { data: typeStats, error: typeError } = await supabase
      .from('notifications')
      .select('type')
      .order('type');

    if (typeError) {
      console.error('❌ Database error:', typeError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch type stats',
        details: typeError.message
      });
    }

    // Count by type
    const typeCounts = {};
    typeStats?.forEach(n => {
      typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
    });

    const stats = {
      total: totalCount || 0,
      unread: unreadCount || 0,
      read: (totalCount || 0) - (unreadCount || 0),
      byType: typeCounts
    };

    console.log('✅ Admin fetched notification stats');
    
    res.json({
      success: true,
      data: stats,
      message: 'Notification statistics retrieved successfully',
      requestedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin notification stats route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

module.exports = router;