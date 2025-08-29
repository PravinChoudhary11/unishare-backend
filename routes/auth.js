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
  console.log('=== /auth/me Debug ===');
  console.log('Session ID:', req.sessionID);
  console.log('Is authenticated:', req.isAuthenticated());
  console.log('User:', req.user?.id);
  console.log('Session keys:', Object.keys(req.session));
  console.log('Has passport session:', !!req.session.passport);
  console.log('Passport user ID:', req.session.passport?.user);
  console.log('=====================');

  if (req.isAuthenticated() && req.user) {
    res.json({ 
      success: true, 
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        picture: req.user.picture
      }
    });
  } else {
    res.status(401).json({ 
      success: false, 
      message: 'Not logged in',
      debug: {
        sessionExists: !!req.session,
        sessionID: req.sessionID,
        hasUser: !!req.user,
        isAuthenticated: req.isAuthenticated(),
        sessionData: req.session
      }
    });
  }
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