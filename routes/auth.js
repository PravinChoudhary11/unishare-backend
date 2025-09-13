// routes/auth.js - FIXED VERSION
const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const router = express.Router();
const passport = require('passport');

// Start Google OAuth
router.get('/google', (req, res, next) => {
  console.log('🔄 Starting Google OAuth flow');
  console.log('Session before OAuth:', req.sessionID);
  
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'consent'
  })(req, res, next);
});

// Callback - FIXED VERSION
router.get(
  '/google/callback',
  (req, res, next) => {
    console.log('🔄 Google OAuth callback received');
    console.log('Session ID in callback:', req.sessionID);
    next();
  },
  passport.authenticate('google', { 
    failureRedirect: `${process.env.FRONTEND_URL}?auth=failed`,
    failureMessage: true
  }),
  async (req, res) => {
    try {
      console.log('✅ OAuth successful for user:', req.user?.id);
      console.log('Session ID after auth:', req.sessionID);
      console.log('Is authenticated:', req.isAuthenticated());
      
      // Ensure session is saved before redirect
      req.session.save((err) => {
        if (err) {
          console.error('❌ Session save error:', err);
          return res.redirect(`${process.env.FRONTEND_URL}?auth=session_error`);
        }
        
        console.log('💾 Session saved successfully');
        res.redirect(`${process.env.FRONTEND_URL}?auth=success`);
      });
      
    } catch (error) {
      console.error('❌ OAuth callback error:', error);
      res.redirect(`${process.env.FRONTEND_URL}?auth=error`);
    }
  }
);

// Current logged-in user with enhanced debugging
router.get('/me', async (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    return res.json({
      success: true,
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        picture: req.user.picture
      }
    });
  }

  // Strapi-style: no error, just null user
  return res.json({
    success: true,
    user: null
  });
});


// Enhanced logout
router.get('/logout', (req, res, next) => {
  console.log('🚪 Logout requested for user:', req.user?.id);
  const sid = req.sessionID;
  
  req.logout({ keepSessionInfo: false }, (err) => {
    if (err) {
      console.error('❌ Logout error:', err);
      return next(err);
    }

    req.session.destroy((err) => {
      if (err) {
        console.error('❌ Session destruction error:', err);
      }

      // Force remove from session store
      if (req.sessionStore && req.sessionStore.destroy) {
        req.sessionStore.destroy(sid, (err) => {
          if (err) console.error('❌ Store destruction error:', err);
        });
      }

      // Clear cookie with same options as session config
      res.clearCookie('connect.sid', {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
      });
      
      console.log('✅ Logout completed successfully');
      res.redirect(`${process.env.FRONTEND_URL}?logout=success`);
    });
  });
});

// Admin route - Show all users (Super Users only)
router.get('/admin/users', async (req, res) => {
  try {
    // Define super users/admins
    const ADMIN_EMAILS = [
      'itspracin750@gmail.com',
      'ask.gsinghr@gmail.com', 
      'mishrilalparihar30221@gmail.com',
      'sumanthjupudi22@gmail.com'
    ];

    // Check if user is authenticated
    if (!req.isAuthenticated() || !req.user) {
      console.log('❌ Admin access denied: Not authenticated');
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Check if user is a super user
    const userEmail = req.user.email;
    if (!ADMIN_EMAILS.includes(userEmail)) {
      console.log('❌ Admin access denied for user:', userEmail);
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super user privileges required.'
      });
    }

    console.log('🔑 Admin access granted to:', userEmail);

    // Import supabase here to avoid circular dependencies
    const supabase = require('../config/supabase');

    // Get all users from database with activity counts
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Database error fetching users:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch users',
        details: error.message
      });
    }

    // Enhance users with activity counts
    const enhancedUsers = await Promise.all(
      (users || []).map(async (user) => {
        try {
          // Get ticket count
          const { count: ticketCount } = await supabase
            .from('tickets')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);

          // Get ride count
          const { count: rideCount } = await supabase
            .from('shared_rides')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);

          // Get lost & found count
          const { count: lostFoundCount } = await supabase
            .from('lost_found_items')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);

          return {
            ...user,
            // Add activity counts for frontend
            postsCount: (ticketCount || 0) + (lostFoundCount || 0),
            ridesCount: rideCount || 0,
            ticketsCount: ticketCount || 0,
            lostFoundCount: lostFoundCount || 0,
            // Ensure required fields
            role: user.role || 'user',
            status: user.is_active !== false ? 'active' : 'inactive'
          };
        } catch (activityError) {
          console.error('❌ Error fetching activity for user:', user.id, activityError);
          return {
            ...user,
            postsCount: 0,
            ridesCount: 0,
            ticketsCount: 0,
            lostFoundCount: 0,
            role: user.role || 'user',
            status: user.is_active !== false ? 'active' : 'inactive'
          };
        }
      })
    );

    console.log(`✅ Admin fetched ${enhancedUsers?.length || 0} users with activity data`);
    
    res.json({
      success: true,
      message: `Found ${enhancedUsers?.length || 0} users`,
      users: enhancedUsers || [], // Change 'data' to 'users' to match frontend expectation
      requestedBy: {
        email: userEmail,
        name: req.user.name,
        id: req.user.id
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin users route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// Admin Analytics - Comprehensive platform analytics (Super Users only)
router.get('/admin/analytics', async (req, res) => {
  try {
    // Define super users/admins
    const ADMIN_EMAILS = [
      'itspracin750@gmail.com',
      'ask.gsinghr@gmail.com', 
      'mishrilalparihar30221@gmail.com',
      'sumanthjupudi22@gmail.com'
    ];

    // Check if user is authenticated
    if (!req.isAuthenticated() || !req.user) {
      console.log('❌ Admin analytics access denied: Not authenticated');
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Check if user is a super user
    const userEmail = req.user.email;
    if (!ADMIN_EMAILS.includes(userEmail)) {
      console.log('❌ Admin analytics access denied for user:', userEmail);
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super user privileges required.'
      });
    }

    console.log('📊 Admin analytics access granted to:', userEmail);

    // Import supabase here to avoid circular dependencies
    const supabase = require('../config/supabase');

    // Calculate date ranges for analytics
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    // Fetch comprehensive analytics data
    const [
      usersResult,
      ticketsResult,
      ridesResult,
      lostFoundResult
    ] = await Promise.all([
      // Users data
      supabase.from('users').select('*'),
      // Tickets data
      supabase.from('tickets').select('*'),
      // Rides data
      supabase.from('shared_rides').select('*'),
      // Lost & Found data
      supabase.from('lost_found_items').select('*')
    ]);

    // Check for errors
    if (usersResult.error) throw usersResult.error;
    if (ticketsResult.error) throw ticketsResult.error;
    if (ridesResult.error) throw ridesResult.error;
    if (lostFoundResult.error) throw lostFoundResult.error;

    const users = usersResult.data || [];
    const tickets = ticketsResult.data || [];
    const rides = ridesResult.data || [];
    const lostFound = lostFoundResult.data || [];

    // Calculate user statistics
    const recentSignups = users.filter(user => {
      const createdDate = new Date(user.created_at);
      return createdDate >= oneWeekAgo;
    }).length;

    const activeUsers = users.filter(user => {
      const createdDate = new Date(user.created_at || user.join_date);
      const lastActive = new Date(user.updated_at || user.last_active || user.created_at);
      return createdDate >= oneMonthAgo || lastActive >= oneWeekAgo;
    }).length;

    // Calculate content statistics
    const totalPosts = tickets.length + rides.length + lostFound.length;

    // Content by category
    const postsByCategory = {
      rideshare: rides.length,
      marketplace: tickets.length,
      lostFound: lostFound.length,
      announcements: 0 // No announcements table yet
    };

    // Calculate engagement rates (simplified - based on active posts)
    const activeTickets = tickets.filter(t => t.status === 'available' || t.status === 'active').length;
    const activeRides = rides.filter(r => r.status === 'active').length;
    const activeLostFound = lostFound.filter(l => l.status === 'active' || l.status === 'open').length;

    const engagementRates = {
      rideshare: rides.length > 0 ? ((activeRides / rides.length) * 100).toFixed(1) : 0,
      marketplace: tickets.length > 0 ? ((activeTickets / tickets.length) * 100).toFixed(1) : 0,
      lostFound: lostFound.length > 0 ? ((activeLostFound / lostFound.length) * 100).toFixed(1) : 0,
      announcements: 0
    };

    // Recent activity trends (simplified calculation)
    const recentTickets = tickets.filter(t => new Date(t.created_at) >= oneWeekAgo).length;
    const recentRides = rides.filter(r => new Date(r.created_at) >= oneWeekAgo).length;
    const recentLostFound = lostFound.filter(l => new Date(l.created_at) >= oneWeekAgo).length;

    // Calculate growth percentages (mock calculation based on recent vs total)
    const userGrowth = users.length > 0 ? ((recentSignups / users.length) * 100).toFixed(1) : 0;
    const activeGrowth = users.length > 0 ? ((activeUsers / users.length) * 100).toFixed(1) : 0;
    const postsGrowth = totalPosts > 0 ? (((recentTickets + recentRides + recentLostFound) / totalPosts) * 100).toFixed(1) : 0;
    const ridesGrowth = rides.length > 0 ? ((recentRides / rides.length) * 100).toFixed(1) : 0;

    // User demographics (simplified)
    const demographics = {
      students: 89.2, // Mock data - would need role/type field
      staff: 8.4,
      faculty: 2.4
    };

    // Daily activity simulation (would need actual tracking)
    const dailyActive = [45, 52, 48, 61, 58, 67, Math.min(activeUsers, 100)];
    const weeklyActive = [312, 298, 345, 367, 389, 412, Math.min(activeUsers * 7, 500)];

    // Build analytics response
    const analytics = {
      success: true,
      overview: {
        totalUsers: users.length,
        userGrowth: parseFloat(userGrowth),
        activeUsers: activeUsers,
        activeGrowth: parseFloat(activeGrowth),
        totalPosts: totalPosts,
        postsGrowth: parseFloat(postsGrowth),
        totalRides: rides.length,
        ridesGrowth: parseFloat(ridesGrowth)
      },
      userStats: {
        dailyActive: dailyActive,
        weeklyActive: weeklyActive,
        monthlySignups: [23, 31, 28, 42, 38, 45, 52, 48, 61, 58, 67, recentSignups],
        demographics: demographics
      },
      contentStats: {
        postsByCategory: postsByCategory,
        engagementRates: {
          rideshare: parseFloat(engagementRates.rideshare),
          marketplace: parseFloat(engagementRates.marketplace),
          lostFound: parseFloat(engagementRates.lostFound),
          announcements: parseFloat(engagementRates.announcements)
        }
      },
      systemStats: {
        uptime: 99.8, // Mock - would need actual monitoring
        responseTime: 145, // Mock - would need actual monitoring
        errorRate: 0.12, // Mock - would need actual monitoring
        activeConnections: Math.min(activeUsers * 2, 2000) // Estimated
      },
      requestedBy: {
        email: userEmail,
        name: req.user.name,
        id: req.user.id
      },
      timestamp: new Date().toISOString(),
      dataRefreshed: new Date().toISOString()
    };

    console.log(`✅ Admin analytics generated for ${userEmail}`);
    
    res.json(analytics);

  } catch (error) {
    console.error('❌ Error in admin analytics route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// Admin Moderation - Content reports and moderation data (Super Users only)
router.get('/admin/reports', async (req, res) => {
  try {
    // Define super users/admins
    const ADMIN_EMAILS = [
      'itspracin750@gmail.com',
      'ask.gsinghr@gmail.com', 
      'mishrilalparihar30221@gmail.com',
      'sumanthjupudi22@gmail.com'
    ];

    // Check if user is authenticated
    if (!req.isAuthenticated() || !req.user) {
      console.log('❌ Admin reports access denied: Not authenticated');
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Check if user is a super user
    const userEmail = req.user.email;
    if (!ADMIN_EMAILS.includes(userEmail)) {
      console.log('❌ Admin reports access denied for user:', userEmail);
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super user privileges required.'
      });
    }

    console.log('🛡️ Admin reports access granted to:', userEmail);

    // Import supabase here to avoid circular dependencies
    const supabase = require('../config/supabase');

    // Get query parameters for filtering
    const {
      status = 'all',
      category = 'all',
      priority = 'all',
      type = 'all',
      limit = 50,
      offset = 0
    } = req.query;

    // Build query for reports
    let query = supabase
      .from('reports')
      .select(`
        *,
        reporter:reported_by (
          id,
          name,
          email
        ),
        reported:reported_user (
          id,
          name,
          email
        ),
        resolver:resolved_by (
          id,
          name,
          email
        )
      `)
      .order('created_at', { ascending: false });

    // Apply filters
    if (status !== 'all') {
      query = query.eq('status', status);
    }
    if (category !== 'all') {
      query = query.eq('category', category);
    }
    if (priority !== 'all') {
      query = query.eq('priority', priority);
    }
    if (type !== 'all') {
      query = query.eq('type', type);
    }

    // Apply pagination
    const limitNum = Math.min(parseInt(limit) || 50, 100);
    const offsetNum = parseInt(offset) || 0;
    query = query.range(offsetNum, offsetNum + limitNum - 1);

    const { data: reports, error, count } = await query;

    if (error) {
      console.error('❌ Database error fetching reports:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch reports',
        details: error.message
      });
    }

    // Get summary statistics
    const { data: summaryData, error: summaryError } = await supabase
      .from('reports')
      .select('status, priority, type, category');

    let summary = {
      total: 0,
      pending: 0,
      reviewing: 0,
      resolved: 0,
      dismissed: 0,
      high_priority: 0,
      by_category: {
        rideshare: 0,
        marketplace: 0,
        'lost-found': 0,
        'user-profile': 0
      },
      by_type: {
        inappropriate_content: 0,
        spam: 0,
        harassment: 0,
        scam: 0,
        misinformation: 0
      }
    };

    if (!summaryError && summaryData) {
      summary.total = summaryData.length;
      
      summaryData.forEach(report => {
        // Count by status
        if (report.status) summary[report.status] = (summary[report.status] || 0) + 1;
        
        // Count high priority
        if (report.priority === 'high') summary.high_priority++;
        
        // Count by category
        if (report.category && summary.by_category[report.category] !== undefined) {
          summary.by_category[report.category]++;
        }
        
        // Count by type
        if (report.type && summary.by_type[report.type] !== undefined) {
          summary.by_type[report.type]++;
        }
      });
    }

    // Transform reports for frontend compatibility
    const transformedReports = (reports || []).map(report => ({
      id: report.id,
      type: report.type,
      category: report.category,
      priority: report.priority,
      status: report.status,
      content: report.description || report.reason || 'No description available',
      contentId: report.content_id,
      reason: report.reason,
      reportedBy: report.reporter?.email || 'Unknown',
      reportedUser: report.reported?.email || 'Unknown',
      screenshots: report.screenshots || [],
      createdAt: report.created_at,
      updatedAt: report.updated_at,
      resolvedAt: report.resolved_at,
      action: report.resolution_action,
      resolutionNotes: report.resolution_notes
    }));

    console.log(`✅ Admin fetched ${transformedReports?.length || 0} reports`);
    
    res.json({
      success: true,
      message: `Found ${transformedReports?.length || 0} reports`,
      reports: transformedReports,
      summary: summary,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total: count || transformedReports.length
      },
      requestedBy: {
        email: userEmail,
        name: req.user.name,
        id: req.user.id
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin reports route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// Admin Moderation Actions - Update report status (Super Users only)
router.put('/admin/reports/:id', async (req, res) => {
  try {
    // Define super users/admins
    const ADMIN_EMAILS = [
      'itspracin750@gmail.com',
      'ask.gsinghr@gmail.com', 
      'mishrilalparihar30221@gmail.com',
      'sumanthjupudi22@gmail.com'
    ];

    // Check if user is authenticated
    if (!req.isAuthenticated() || !req.user) {
      console.log('❌ Admin reports update denied: Not authenticated');
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Check if user is a super user
    const userEmail = req.user.email;
    if (!ADMIN_EMAILS.includes(userEmail)) {
      console.log('❌ Admin reports update denied for user:', userEmail);
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super user privileges required.'
      });
    }

    const reportId = req.params.id;
    const { status, action, notes } = req.body;

    console.log('🛡️ Admin updating report:', reportId, 'by:', userEmail);

    // Import supabase here to avoid circular dependencies
    const supabase = require('../config/supabase');

    // Update the report
    const { data: updatedReport, error } = await supabase
      .from('reports')
      .update({
        status: status,
        resolution_action: action,
        resolution_notes: notes,
        resolved_by: req.user.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', reportId)
      .select()
      .single();

    if (error) {
      console.error('❌ Database error updating report:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update report',
        details: error.message
      });
    }

    console.log('✅ Report updated successfully:', reportId);
    
    res.json({
      success: true,
      message: 'Report updated successfully',
      report: updatedReport,
      updatedBy: {
        email: userEmail,
        name: req.user.name,
        id: req.user.id
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error updating report:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// Admin Recent Activity - Get recent platform activity (Super Users only)
router.get('/admin/activity', async (req, res) => {
  try {
    // Define super users/admins
    const ADMIN_EMAILS = [
      'itspracin750@gmail.com',
      'ask.gsinghr@gmail.com', 
      'mishrilalparihar30221@gmail.com',
      'sumanthjupudi22@gmail.com'
    ];

    // Check if user is authenticated
    if (!req.isAuthenticated() || !req.user) {
      console.log('❌ Admin activity access denied: Not authenticated');
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Check if user is a super user
    const userEmail = req.user.email;
    if (!ADMIN_EMAILS.includes(userEmail)) {
      console.log('❌ Admin activity access denied for user:', userEmail);
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super user privileges required.'
      });
    }

    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    console.log('📊 Admin activity access granted to:', userEmail, 'limit:', limit);

    // Import supabase here to avoid circular dependencies
    const supabase = require('../config/supabase');

    // Get recent activities from different tables
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const activities = [];

    // Fetch recent user registrations
    const { data: recentUsers, error: usersError } = await supabase
      .from('users')
      .select('id, name, email, created_at')
      .gte('created_at', oneWeekAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(5);

    if (!usersError && recentUsers) {
      recentUsers.forEach(user => {
        activities.push({
          id: `user-${user.id}`,
          type: 'user',
          action: 'New user registered',
          user: user.email || user.name || 'Unknown User',
          time: formatTimeAgo(user.created_at),
          icon: 'Users',
          color: 'bg-green-500',
          timestamp: new Date(user.created_at),
          details: {
            userId: user.id,
            userName: user.name,
            userEmail: user.email
          }
        });
      });
    }

    // Fetch recent ride postings
    const { data: recentRides, error: ridesError } = await supabase
      .from('shared_rides')
      .select('id, driver_name, from_location, to_location, created_at, user_id, users:user_id(name, email)')
      .gte('created_at', oneWeekAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(5);

    if (!ridesError && recentRides) {
      recentRides.forEach(ride => {
        activities.push({
          id: `ride-${ride.id}`,
          type: 'ride',
          action: 'New ride posted',
          user: ride.users?.email || ride.driver_name || 'Unknown Driver',
          time: formatTimeAgo(ride.created_at),
          icon: 'Car',
          color: 'bg-blue-500',
          timestamp: new Date(ride.created_at),
          details: {
            rideId: ride.id,
            route: `${ride.from_location} → ${ride.to_location}`,
            driver: ride.driver_name
          }
        });
      });
    }

    // Fetch recent ticket postings
    const { data: recentTickets, error: ticketsError } = await supabase
      .from('tickets')
      .select('id, title, category, created_at, user_id, users:user_id(name, email)')
      .gte('created_at', oneWeekAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(5);

    if (!ticketsError && recentTickets) {
      recentTickets.forEach(ticket => {
        activities.push({
          id: `ticket-${ticket.id}`,
          type: 'marketplace',
          action: 'New ticket posted',
          user: ticket.users?.email || 'Unknown User',
          time: formatTimeAgo(ticket.created_at),
          icon: 'Package',
          color: 'bg-purple-500',
          timestamp: new Date(ticket.created_at),
          details: {
            ticketId: ticket.id,
            title: ticket.title,
            category: ticket.category
          }
        });
      });
    }

    // Fetch recent lost & found items
    const { data: recentLostFound, error: lostFoundError } = await supabase
      .from('lost_found_items')
      .select('id, item_name, mode, created_at, user_id, users:user_id(name, email)')
      .gte('created_at', oneWeekAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(5);

    if (!lostFoundError && recentLostFound) {
      recentLostFound.forEach(item => {
        activities.push({
          id: `lostfound-${item.id}`,
          type: 'lost-found',
          action: `${item.mode === 'lost' ? 'Item lost' : 'Item found'} reported`,
          user: item.users?.email || 'Unknown User',
          time: formatTimeAgo(item.created_at),
          icon: 'Search',
          color: item.mode === 'lost' ? 'bg-orange-500' : 'bg-teal-500',
          timestamp: new Date(item.created_at),
          details: {
            itemId: item.id,
            itemName: item.item_name,
            mode: item.mode
          }
        });
      });
    }

    // Fetch recent reports (if reports table exists)
    try {
      const { data: recentReports, error: reportsError } = await supabase
        .from('reports')
        .select('id, type, category, created_at, reported_by, reporter:reported_by(name, email)')
        .gte('created_at', oneWeekAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(3);

      if (!reportsError && recentReports) {
        recentReports.forEach(report => {
          activities.push({
            id: `report-${report.id}`,
            type: 'report',
            action: 'Content reported',
            user: report.reporter?.email || 'Unknown User',
            time: formatTimeAgo(report.created_at),
            icon: 'AlertTriangle',
            color: 'bg-red-500',
            timestamp: new Date(report.created_at),
            details: {
              reportId: report.id,
              reportType: report.type,
              category: report.category
            }
          });
        });
      }
    } catch (reportsTableError) {
      // Reports table might not exist yet, skip this section
      console.log('Reports table not available, skipping reports activity');
    }

    // Sort all activities by timestamp (newest first) and limit
    const sortedActivities = activities
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
      .map(activity => {
        // Remove timestamp for response (keep only formatted time)
        const { timestamp, ...activityWithoutTimestamp } = activity;
        return activityWithoutTimestamp;
      });

    console.log(`✅ Admin fetched ${sortedActivities.length} recent activities`);
    
    res.json({
      success: true,
      activities: sortedActivities,
      total: sortedActivities.length,
      message: `Found ${sortedActivities.length} recent activities`,
      requestedBy: {
        email: userEmail,
        name: req.user.name,
        id: req.user.id
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin activity route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// Helper function to format time ago
const formatTimeAgo = (dateString) => {
  if (!dateString) return 'Unknown time';
  
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString();
};

// Health check for auth
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    authenticated: req.isAuthenticated(),
    sessionID: req.sessionID,
    hasUser: !!req.user
  });
});

module.exports = router;