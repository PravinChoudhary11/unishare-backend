// middleware/requireAuth.js - Unified Authentication middleware for UniShare
const supabase = require('../config/supabase');

/**
 * Require authentication - blocks request if user is not logged in
 */
const requireAuth = (req, res, next) => {
  console.log('🔐 Auth middleware - checking authentication');
  console.log('Session ID:', req.sessionID);
  console.log('Is authenticated:', req.isAuthenticated ? req.isAuthenticated() : 'N/A');
  console.log('User:', req.user?.id || 'None');

  // Check if user is authenticated via session
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    console.log('❌ Authentication failed - not authenticated');
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please log in to continue.',
      error: 'UNAUTHORIZED'
    });
  }

  // Check if user object exists in session
  if (!req.user || !req.user.id) {
    console.log('❌ Authentication failed - no user object');
    return res.status(401).json({
      success: false,
      message: 'Invalid session. Please log in again.',
      error: 'INVALID_SESSION'
    });
  }

  // Attach user ID for easy access in routes
  req.userId = req.user.id;
  
  console.log(`✅ Auth middleware: User ${req.user.id} authenticated`);
  next();
};

/**
 * Optional auth - doesn't block request if not authenticated
 */
const optionalAuth = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated() && req.user?.id) {
    req.userId = req.user.id;
    console.log(`✅ Optional auth: User ${req.user.id} authenticated`);
  } else {
    req.userId = null;
    console.log('ℹ️  Optional auth: No authentication (anonymous request)');
  }
  next();
};

/**
 * Check if user owns a specific resource (for rooms, items, etc.)
 * @param {string} table - Database table name ('rooms', 'item_sell', etc.)
 * @param {string} userIdField - Field name that contains user ID (default: 'user_id')
 * @param {string} resourceIdField - Request parameter containing resource ID (default: 'id')
 */
const requireOwnership = (table = 'rooms', userIdField = 'user_id', resourceIdField = 'id') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[resourceIdField];
      const userId = req.user?.id;

      if (!userId) {
        console.log('❌ Ownership check failed - no user ID');
        return res.status(401).json({ 
          success: false,
          error: 'Authentication required',
          message: 'Please log in to access this resource'
        });
      }

      if (!resourceId) {
        console.log('❌ Ownership check failed - no resource ID');
        return res.status(400).json({ 
          success: false,
          error: 'Missing resource ID' 
        });
      }

      console.log(`🔐 Ownership check for ${table}:${resourceId} by user:${userId}`);

      // Fetch the resource to check ownership
      const { data: resource, error } = await supabase
        .from(table)
        .select(userIdField)
        .eq('id', resourceId)
        .single();

      if (error) {
        console.error('❌ Error checking ownership:', error);
        if (error.code === 'PGRST116') { // No rows returned
          return res.status(404).json({ 
            success: false,
            error: 'Resource not found' 
          });
        }
        return res.status(500).json({ 
          success: false,
          error: 'Database error during ownership check' 
        });
      }

      if (!resource) {
        console.log('❌ Resource not found:', resourceId);
        return res.status(404).json({ 
          success: false,
          error: 'Resource not found' 
        });
      }

      if (resource[userIdField] !== userId) {
        console.log(`❌ Ownership denied - resource owner: ${resource[userIdField]} vs user: ${userId}`);
        return res.status(403).json({ 
          success: false,
          error: 'Access denied',
          message: 'You can only modify your own listings'
        });
      }

      console.log(`✅ Ownership verified for user: ${userId}`);
      next();
    } catch (err) {
      console.error('❌ Ownership check error:', err);
      res.status(500).json({ 
        success: false,
        error: 'Server error during authorization check',
        details: err.message
      });
    }
  };
};

/**
 * Check if user owns a resource OR is an admin (admins can modify any resource)
 * @param {string} table - Database table name ('rooms', 'item_sell', etc.)
 * @param {string} userIdField - Field name that contains user ID (default: 'user_id')
 * @param {string} resourceIdField - Request parameter containing resource ID (default: 'id')
 */
const requireOwnershipOrAdmin = (table = 'rooms', userIdField = 'user_id', resourceIdField = 'id') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[resourceIdField];
      const userId = req.user?.id;

      if (!userId) {
        console.log('❌ Ownership/Admin check failed - no user ID');
        return res.status(401).json({ 
          success: false,
          error: 'Authentication required',
          message: 'Please log in to access this resource'
        });
      }

      if (!resourceId) {
        console.log('❌ Ownership/Admin check failed - no resource ID');
        return res.status(400).json({ 
          success: false,
          error: 'Missing resource ID' 
        });
      }

      // Check if user is admin first
      const { ADMIN_EMAILS } = require('../config/admin');
      const isAdmin = req.user?.email && ADMIN_EMAILS.includes(req.user.email);

      if (isAdmin) {
        console.log(`👑 Admin access granted for ${table}:${resourceId} by admin:${req.user.email}`);
        req.isAdminAccess = true;
        return next();
      }

      console.log(`🔐 Ownership check for ${table}:${resourceId} by user:${userId}`);

      // Fetch the resource to check ownership (non-admin users)
      const { data: resource, error } = await supabase
        .from(table)
        .select(userIdField)
        .eq('id', resourceId)
        .single();

      if (error) {
        console.error('❌ Error checking ownership:', error);
        if (error.code === 'PGRST116') { // No rows returned
          return res.status(404).json({ 
            success: false,
            error: 'Resource not found' 
          });
        }
        return res.status(500).json({ 
          success: false,
          error: 'Database error during ownership check' 
        });
      }

      if (!resource) {
        console.log('❌ Resource not found:', resourceId);
        return res.status(404).json({ 
          success: false,
          error: 'Resource not found' 
        });
      }

      if (resource[userIdField] !== userId) {
        console.log(`❌ Access denied - resource owner: ${resource[userIdField]} vs user: ${userId} (not admin)`);
        return res.status(403).json({ 
          success: false,
          error: 'Access denied',
          message: 'You can only modify your own listings'
        });
      }

      console.log(`✅ Ownership verified for user: ${userId}`);
      req.isAdminAccess = false;
      next();
    } catch (err) {
      console.error('❌ Ownership/Admin check error:', err);
      res.status(500).json({ 
        success: false,
        error: 'Server error during authorization check',
        details: err.message
      });
    }
  };
};

/**
 * Require ownership for rooms specifically
 */
const requireRoomOwnership = () => requireOwnership('rooms', 'user_id', 'id');

/**
 * Require ownership for items specifically  
 */
const requireItemOwnership = () => requireOwnership('item_sell', 'user_id', 'id');

/**
 * Require ownership for tickets specifically  
 */
const requireTicketOwnership = () => requireOwnership('tickets', 'user_id', 'id');

/**
 * Require ownership OR admin access for rooms specifically
 */
const requireRoomOwnershipOrAdmin = () => requireOwnershipOrAdmin('rooms', 'user_id', 'id');

/**
 * Require ownership OR admin access for items specifically  
 */
const requireItemOwnershipOrAdmin = () => requireOwnershipOrAdmin('item_sell', 'user_id', 'id');

/**
 * Require ownership OR admin access for tickets specifically  
 */
const requireTicketOwnershipOrAdmin = () => requireOwnershipOrAdmin('tickets', 'user_id', 'id');

/**
 * Require ownership OR admin access for lost/found items specifically  
 */
const requireLostFoundOwnershipOrAdmin = () => requireOwnershipOrAdmin('lost_found_items', 'user_id', 'id');

/**
 * Require ownership OR admin access for shareride items specifically  
 */
const requireShareRideOwnershipOrAdmin = () => requireOwnershipOrAdmin('shareride', 'user_id', 'id');

module.exports = {
  requireAuth,
  optionalAuth,
  requireOwnership,
  requireOwnershipOrAdmin,
  requireRoomOwnership,
  requireItemOwnership,
  requireTicketOwnership,
  requireRoomOwnershipOrAdmin,
  requireItemOwnershipOrAdmin,
  requireTicketOwnershipOrAdmin,
  requireLostFoundOwnershipOrAdmin,
  requireShareRideOwnershipOrAdmin
};