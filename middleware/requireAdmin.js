const { ADMIN_EMAILS } = require('../config/admin');

function requireAdmin(req, res, next) {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  if (!ADMIN_EMAILS.includes(req.user.email)) {
    return res.status(403).json({ success: false, message: 'Admin privileges required' });
  }

  next();
}

module.exports = requireAdmin;
