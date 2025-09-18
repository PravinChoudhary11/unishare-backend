// routes/auth.js - Authentication routes only
const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const router = express.Router();
const passport = require('passport');

// Start Google OAuth
router.get('/google', (req, res, next) => {
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'consent'
  })(req, res, next);
});

// Callback - FIXED VERSION
router.get(
  '/google/callback',
  passport.authenticate('google', { 
    failureRedirect: `${process.env.FRONTEND_URL}?auth=failed`,
    failureMessage: true
  }),
  async (req, res) => {
    try {
      // Ensure session is saved before redirect
      req.session.save((err) => {
        if (err) {
          console.error('❌ Session save error:', err);
          return res.redirect(`${process.env.FRONTEND_URL}?auth=session_error`);
        }
        
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
      
      res.redirect(`${process.env.FRONTEND_URL}?logout=success`);
    });
  });
});

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