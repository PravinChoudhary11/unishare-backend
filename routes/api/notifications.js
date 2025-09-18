// routes/api/notifications.js - User notifications API (view their own notifications)
const express = require('express');
const router = express.Router();
const supabase = require('../../config/supabase');
const { requireAuth } = require('../../middleware/requireAuth');

// GET /api/notifications - Get user's notifications (authenticated users only)
router.get('/', requireAuth, async (req, res) => {
  try {
    console.log('🔔 User fetching notifications:', req.user.id);

    const { read, limit = 50 } = req.query;
    
    // Get notifications for this user
    const { data: rawNotifications, error: notifError } = await supabase
      .from('notifications')
      .select('id, title, message, type, created_at, recipient_type, recipient_id')
      .or(`recipient_id.eq.${req.user.id},recipient_type.eq.all`)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (notifError) {
      console.error('❌ Database error fetching notifications:', notifError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch notifications',
        details: notifError.message
      });
    }

    if (!rawNotifications || rawNotifications.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: 'No notifications found'
      });
    }

    // Get read status for this user (check if table exists)
    let userReadNotifications = [];
    try {
      const { data: readData, error: readError } = await supabase
        .from('user_notification_reads')
        .select('notification_id, read_at')
        .eq('user_id', req.user.id)
        .in('notification_id', rawNotifications.map(n => n.id));

      if (readError) {
        console.warn('⚠️ user_notification_reads table may not exist yet:', readError.message);
        console.log('📝 Using fallback: all notifications will show as unread');
        // Continue with empty read data - all notifications will be unread
      } else {
        userReadNotifications = readData || [];
      }
    } catch (error) {
      console.warn('⚠️ Error accessing user_notification_reads table:', error.message);
      // Continue with empty read data
    }

    // Create read status lookup
    const readStatusMap = new Map();
    userReadNotifications.forEach(read => {
      readStatusMap.set(read.notification_id, read.read_at);
    });

    // Process notifications to add individual read status
    const notifications = rawNotifications.map(notification => {
      const readAt = readStatusMap.get(notification.id);
      
      return {
        id: notification.id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        created_at: notification.created_at,
        read: !!readAt,
        read_at: readAt || null
      };
    });

    // Filter by read status if specified
    const filteredNotifications = read !== undefined 
      ? notifications.filter(n => n.read === (read === 'true'))
      : notifications;

    console.log(`✅ User fetched ${filteredNotifications?.length || 0} notifications`);
    
    res.json({
      success: true,
      data: filteredNotifications || [],
      message: `Found ${filteredNotifications?.length || 0} notifications`
    });

  } catch (error) {
    console.error('❌ Error in get notifications route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /api/notifications/unread-count - Get count of unread notifications
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    console.log('🔔 User fetching unread count:', req.user.id);

    // Get all notifications for user
    const { data: allNotifications, error: notifError } = await supabase
      .from('notifications')
      .select('id')
      .or(`recipient_id.eq.${req.user.id},recipient_type.eq.all`);

    if (notifError) {
      console.error('❌ Database error fetching notifications:', notifError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch notifications',
        details: notifError.message
      });
    }

    // Get notifications this user has read (handle table not existing)
    let readNotifications = [];
    try {
      const { data: readData, error: readError } = await supabase
        .from('user_notification_reads')
        .select('notification_id')
        .eq('user_id', req.user.id);

      if (readError) {
        console.warn('⚠️ user_notification_reads table may not exist yet:', readError.message);
        console.log('📝 Using fallback: all notifications will be counted as unread');
        // Continue with empty read data
      } else {
        readNotifications = readData || [];
      }
    } catch (error) {
      console.warn('⚠️ Error accessing user_notification_reads table:', error.message);
      // Continue with empty read data
    }

    const totalNotifications = allNotifications?.length || 0;
    const readNotificationIds = new Set(readNotifications?.map(r => r.notification_id) || []);
    const unreadCount = totalNotifications - readNotificationIds.size;

    console.log(`✅ User has ${unreadCount} unread notifications out of ${totalNotifications} total`);
    
    res.json({
      success: true,
      data: { 
        unreadCount,
        totalCount: totalNotifications,
        readCount: readNotificationIds.size
      },
      message: `${unreadCount} unread notifications`
    });

  } catch (error) {
    console.error('❌ Error in get unread count route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// PATCH /api/notifications/:id/read - Mark notification as read
router.patch('/:id/read', requireAuth, async (req, res) => {
  try {
    const notificationId = req.params.id;
    console.log('🔔 User marking notification as read:', notificationId);

    // Validate ID format
    if (!/^\d+$/.test(notificationId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification ID format'
      });
    }

    // Check if notification belongs to user or is global
    const { data: notification, error: fetchError } = await supabase
      .from('notifications')
      .select('recipient_id, recipient_type')
      .eq('id', notificationId)
      .single();

    if (fetchError || !notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // Check permission (must be recipient or global notification)
    if (notification.recipient_type !== 'all' && notification.recipient_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only mark your own notifications as read'
      });
    }

    // Check if user has already read this notification
    const { data: existingRead, error: checkError } = await supabase
      .from('user_notification_reads')
      .select('id, read_at')
      .eq('user_id', req.user.id)
      .eq('notification_id', notificationId)
      .maybeSingle();

    if (checkError) {
      console.error('❌ Database error checking existing read status:', checkError);
      return res.status(500).json({
        success: false,
        message: 'Failed to check read status',
        details: checkError.message
      });
    }

    // If already read, return success with existing data
    if (existingRead) {
      console.log('ℹ️ Notification already marked as read for user:', notificationId, req.user.id);
      
      return res.json({
        success: true,
        data: {
          notificationId: parseInt(notificationId),
          userId: req.user.id,
          readAt: existingRead.read_at,
          read: true,
          alreadyRead: true
        },
        message: 'Notification was already marked as read'
      });
    }

    // Insert new read record
    const { data: readRecord, error } = await supabase
      .from('user_notification_reads')
      .insert({
        user_id: req.user.id,
        notification_id: notificationId,
        read_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Database error:', error);
      
      // Check if it's a table not found error
      if (error.code === 'PGRST204') {
        return res.status(500).json({
          success: false,
          message: 'user_notification_reads table does not exist. Please run the database setup script.',
          details: 'Run the SQL in database/user-notification-reads.sql to create the required table.',
          setupRequired: true
        });
      }
      
      return res.status(500).json({
        success: false,
        message: 'Failed to mark notification as read',
        details: error.message
      });
    }

    console.log('✅ Notification marked as read for user:', notificationId, req.user.id);
    
    res.json({
      success: true,
      data: {
        notificationId: parseInt(notificationId),
        userId: req.user.id,
        readAt: readRecord.read_at,
        read: true
      },
      message: 'Notification marked as read'
    });

  } catch (error) {
    console.error('❌ Error in mark as read route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// PATCH /api/notifications/mark-all-read - Mark all user's notifications as read
router.patch('/mark-all-read', requireAuth, async (req, res) => {
  try {
    console.log('🔔 User marking all notifications as read:', req.user.id);

    // Get all notifications for this user
    const { data: userNotifications, error: fetchError } = await supabase
      .from('notifications')
      .select('id')
      .or(`recipient_id.eq.${req.user.id},recipient_type.eq.all`);

    if (fetchError) {
      console.error('❌ Database error fetching notifications:', fetchError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch notifications',
        details: fetchError.message
      });
    }

    if (!userNotifications?.length) {
      return res.json({
        success: true,
        data: { count: 0 },
        message: 'No notifications to mark as read'
      });
    }

    // Get already read notifications for this user
    const { data: alreadyRead, error: readError } = await supabase
      .from('user_notification_reads')
      .select('notification_id')
      .eq('user_id', req.user.id);

    if (readError) {
      console.error('❌ Database error fetching read status:', readError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch read status',
        details: readError.message
      });
    }

    // Find notifications not yet read
    const alreadyReadIds = new Set(alreadyRead?.map(r => r.notification_id) || []);
    const unreadNotifications = userNotifications.filter(n => !alreadyReadIds.has(n.id));

    if (unreadNotifications.length === 0) {
      return res.json({
        success: true,
        data: { count: 0 },
        message: 'All notifications are already marked as read'
      });
    }

    // Create read records for unread notifications
    const readRecords = unreadNotifications.map(notif => ({
      user_id: req.user.id,
      notification_id: notif.id,
      read_at: new Date().toISOString()
    }));

    const { data: insertedRecords, error } = await supabase
      .from('user_notification_reads')
      .insert(readRecords)
      .select();

    if (error) {
      console.error('❌ Database error inserting read records:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to mark notifications as read',
        details: error.message
      });
    }

    const count = insertedRecords?.length || 0;
    console.log(`✅ Marked ${count} notifications as read for user:`, req.user.id);
    
    res.json({
      success: true,
      data: { count },
      message: `Marked ${count} notifications as read`
    });

  } catch (error) {
    console.error('❌ Error in mark all as read route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// DELETE /api/notifications/:id - Delete notification (user can only delete their own)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const notificationId = req.params.id;
    console.log('🔔 User deleting notification:', notificationId);

    // Validate ID format
    if (!/^\d+$/.test(notificationId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification ID format'
      });
    }

    // Check if notification belongs to user (only personal notifications can be deleted)
    const { data: notification, error: fetchError } = await supabase
      .from('notifications')
      .select('recipient_id, recipient_type')
      .eq('id', notificationId)
      .single();

    if (fetchError || !notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // Only allow deleting personal notifications
    if (notification.recipient_type === 'all') {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete global notifications'
      });
    }

    if (notification.recipient_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own notifications'
      });
    }

    const { data: deletedNotification, error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .select()
      .single();

    if (error) {
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete notification',
        details: error.message
      });
    }

    console.log('✅ Notification deleted:', notificationId);
    
    res.json({
      success: true,
      data: deletedNotification,
      message: 'Notification deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error in delete notification route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// PUBLIC ROUTE: PATCH /api/notifications/public/:id/read - Mark notification as read (no auth required)
// Requires user_id in request body to track individual read status
router.patch('/public/:id/read', async (req, res) => {
  try {
    const notificationId = req.params.id;
    const { user_id } = req.body;
    console.log('🔓 Public request to mark notification as read:', notificationId, 'for user:', user_id);

    // Validate inputs
    if (!/^\d+$/.test(notificationId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification ID format'
      });
    }

    if (!user_id || typeof user_id !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'user_id is required in request body'
      });
    }

    // Verify notification exists
    const { data: notification, error: fetchError } = await supabase
      .from('notifications')
      .select('id, recipient_type, recipient_id')
      .eq('id', notificationId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }
      console.error('❌ Database error:', fetchError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch notification',
        details: fetchError.message
      });
    }

    // Check if user has already read this notification
    const { data: existingRead, error: checkError } = await supabase
      .from('user_notification_reads')
      .select('id, read_at')
      .eq('user_id', user_id)
      .eq('notification_id', notificationId)
      .maybeSingle();

    if (checkError) {
      console.error('❌ Database error checking existing read status:', checkError);
      return res.status(500).json({
        success: false,
        message: 'Failed to check read status',
        details: checkError.message
      });
    }

    // If already read, return success with existing data
    if (existingRead) {
      console.log('ℹ️ Public notification already marked as read for user:', notificationId, user_id);
      
      return res.json({
        success: true,
        data: {
          notificationId: parseInt(notificationId),
          userId: user_id,
          readAt: existingRead.read_at,
          read: true,
          alreadyRead: true
        },
        message: 'Notification was already marked as read'
      });
    }

    // Insert new read record
    const { data: readRecord, error } = await supabase
      .from('user_notification_reads')
      .insert({
        user_id: user_id,
        notification_id: notificationId,
        read_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to mark notification as read',
        details: error.message
      });
    }

    console.log('✅ Public notification marked as read for user:', notificationId, user_id);
    
    res.json({
      success: true,
      data: {
        notificationId: parseInt(notificationId),
        userId: user_id,
        readAt: readRecord.read_at,
        read: true
      },
      message: 'Notification marked as read successfully'
    });

  } catch (error) {
    console.error('❌ Error in public mark as read route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// PUBLIC ROUTE: PATCH /api/notifications/public/:id/toggle - Toggle read status (no auth required)  
// Requires user_id in request body to track individual read status
router.patch('/public/:id/toggle', async (req, res) => {
  try {
    const notificationId = req.params.id;
    const { user_id } = req.body;
    console.log('🔓 Public request to toggle notification read status:', notificationId, 'for user:', user_id);

    // Validate inputs
    if (!/^\d+$/.test(notificationId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification ID format'
      });
    }

    if (!user_id || typeof user_id !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'user_id is required in request body'
      });
    }

    // Check if notification exists
    const { data: notification, error: notifError } = await supabase
      .from('notifications')
      .select('id')
      .eq('id', notificationId)
      .single();

    if (notifError) {
      if (notifError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }
      console.error('❌ Database error:', notifError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch notification',
        details: notifError.message
      });
    }

    // Check current read status for this user
    const { data: currentReadStatus, error: readError } = await supabase
      .from('user_notification_reads')
      .select('read_at')
      .eq('user_id', user_id)
      .eq('notification_id', notificationId)
      .maybeSingle();

    if (readError) {
      console.error('❌ Database error checking read status:', readError);
      return res.status(500).json({
        success: false,
        message: 'Failed to check read status',
        details: readError.message
      });
    }

    const currentlyRead = !!currentReadStatus;
    const newReadStatus = !currentlyRead;

    let resultData;

    if (newReadStatus) {
      // Mark as read - insert into user_notification_reads (use INSERT with ON CONFLICT)
      const { data: readRecord, error } = await supabase
        .from('user_notification_reads')
        .insert({
          user_id: user_id,
          notification_id: notificationId,
          read_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        // Handle duplicate key constraint
        if (error.code === '23505') {
          console.log('ℹ️ Notification already marked as read, returning existing status');
          
          // Get existing read record
          const { data: existing } = await supabase
            .from('user_notification_reads')
            .select('read_at')
            .eq('user_id', user_id)
            .eq('notification_id', notificationId)
            .single();

          resultData = {
            notificationId: parseInt(notificationId),
            userId: user_id,
            readAt: existing?.read_at || new Date().toISOString(),
            read: true,
            alreadyRead: true
          };
        } else {
          console.error('❌ Database error marking as read:', error);
          return res.status(500).json({
            success: false,
            message: 'Failed to mark notification as read',
            details: error.message
          });
        }
      } else {
        resultData = {
          notificationId: parseInt(notificationId),
          userId: user_id,
          readAt: readRecord.read_at,
          read: true
        };
      }
    } else {
      // Mark as unread - remove from user_notification_reads
      const { error } = await supabase
        .from('user_notification_reads')
        .delete()
        .eq('user_id', user_id)
        .eq('notification_id', notificationId);

      if (error) {
        console.error('❌ Database error marking as unread:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to mark notification as unread',
          details: error.message
        });
      }

      resultData = {
        notificationId: parseInt(notificationId),
        userId: user_id,
        readAt: null,
        read: false
      };
    }

    console.log(`✅ Public notification read status toggled to ${newReadStatus} for user:`, notificationId, user_id);
    
    res.json({
      success: true,
      data: resultData,
      message: `Notification marked as ${newReadStatus ? 'read' : 'unread'} successfully`,
      previousStatus: currentlyRead,
      newStatus: newReadStatus
    });

  } catch (error) {
    console.error('❌ Error in public toggle read route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

module.exports = router;