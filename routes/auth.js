// routes/auth.js
const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const router = express.Router();
const passport = require('passport');

// Start Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] , prompt: 'consent'}));

// Callback
router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: process.env.FRONTEND_URL }),
  (req, res) => {
    res.redirect(process.env.FRONTEND_URL);
  }
);

// Current logged-in user
router.get('/me', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ success: true, user: req.user });
  } else {
    res.status(401).json({ success: false, message: 'Not logged in' });
  }
});

router.get('/logout', (req, res, next) => {
  const sid = req.sessionID; // get current session ID
  req.logout({ keepSessionInfo: false }, (err) => {
    if (err) return next(err);

    req.session.destroy((err) => {
      if (err) console.error('Session destruction error:', err);

      // Force remove from SQLiteStore too
      req.sessionStore.destroy(sid, (err) => {
        if (err) console.error('Store destruction error:', err);
      });

      // Clear cookie
      res.clearCookie('connect.sid', { path: '/' });
      res.redirect(process.env.FRONTEND_URL);
    });
  });
});


module.exports = router;
