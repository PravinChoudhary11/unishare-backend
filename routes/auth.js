// routes/auth.js - Authentication routes only
const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const router = express.Router();
const passport = require('passport');
const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');

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

// Email/Password Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Check if user exists in Supabase
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (error || !users) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if user has a password (not OAuth-only user)
    if (!users.password) {
      return res.status(401).json({
        success: false,
        message: 'This account uses Google login. Please sign in with Google.'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, users.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Create session
    req.login(users, (err) => {
      if (err) {
        console.error('Session creation error:', err);
        return res.status(500).json({
          success: false,
          message: 'Login failed. Please try again.'
        });
      }

      // Return user data
      return res.json({
        success: true,
        message: 'Login successful',
        user: {
          id: users.id,
          name: users.name,
          email: users.email,
          picture: users.picture
        }
      });
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred during login'
    });
  }
});

// Email/Password Registration
router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password, university } = req.body;

    // Validate input
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }

    // Check if user already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('email')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate unique user ID
    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Prepare user data - only include fields that exist in the database
    const userData = {
      id: userId,
      name: `${firstName} ${lastName}`,
      email: email.toLowerCase(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_login: new Date().toISOString()
    };

    // Add optional fields only if they have values
    if (hashedPassword) userData.password = hashedPassword;
    if (university) userData.university = university;

    // Create user in Supabase
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([userData])
      .select()
      .single();

    if (insertError) {
      console.error('User creation error:', insertError);
      console.error('Insert error details:', JSON.stringify(insertError, null, 2));
      
      // Provide more specific error messages
      if (insertError.code === '23505') {
        return res.status(409).json({
          success: false,
          message: 'An account with this email already exists'
        });
      }
      
      if (insertError.code === '42703') {
        return res.status(500).json({
          success: false,
          message: 'Database configuration error. The password field may not exist in the users table. Please contact support.'
        });
      }
      
      return res.status(500).json({
        success: false,
        message: `Failed to create account: ${insertError.message || 'Unknown error'}`,
        details: insertError.hint || null
      });
    }

    // Auto-login after registration
    req.login(newUser, (err) => {
      if (err) {
        console.error('Auto-login error:', err);
        // Still return success even if auto-login fails
        return res.json({
          success: true,
          message: 'Account created successfully! Please log in.',
          user: null
        });
      }

      return res.json({
        success: true,
        message: 'Account created successfully!',
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          picture: newUser.picture
        }
      });
    });

  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred during registration'
    });
  }
});

module.exports = router;