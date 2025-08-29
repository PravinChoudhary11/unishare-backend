// middleware/auth.js
const requireAuth = (req, res, next) => {
  console.log('🔐 Auth middleware - checking authentication');
  console.log('Session ID:', req.sessionID);
  console.log('Is authenticated:', req.isAuthenticated());
  console.log('User:', req.user?.id);

  if (!req.isAuthenticated() || !req.user) {
    console.log('❌ Authentication failed - no user session');
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'Please log in to access this resource'
    });
  }

  console.log('✅ User authenticated:', req.user.id);
  next();
};

const requireOwnership = (userIdField = 'user_id') => {
  return async (req, res, next) => {
    try {
      const supabase = require('../config/supabase');
      const resourceId = req.params.id;
      const userId = req.user.id;

      console.log('🔐 Ownership check for resource:', resourceId, 'user:', userId);

      // Fetch the resource to check ownership
      const { data: resource, error } = await supabase
        .from('rooms')
        .select('user_id')
        .eq('id', resourceId)
        .single();

      if (error) {
        console.error('❌ Error checking ownership:', error);
        return res.status(404).json({ error: 'Resource not found' });
      }

      if (resource.user_id !== userId) {
        console.log('❌ Ownership denied - resource owner:', resource.user_id, 'vs user:', userId);
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You can only modify your own listings'
        });
      }

      console.log('✅ Ownership verified for user:', userId);
      next();
    } catch (err) {
      console.error('❌ Ownership check error:', err);
      res.status(500).json({ error: 'Server error during authorization check' });
    }
  };
};

module.exports = {
  requireAuth,
  requireOwnership
};