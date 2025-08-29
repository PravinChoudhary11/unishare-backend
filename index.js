//index.js
const dotenv = require('dotenv');
dotenv.config();

// Load passport configuration AFTER environment variables
require('./config/passport');

const express = require('express');
const app = express();
const morgan = require('morgan');
const ejs = require('ejs');
const passport = require('passport');
const session = require('express-session');
const helmet = require('helmet');
const path = require('path');
const sessionConfig = require('./config/session');
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms'); // Add room routes
const cors = require('cors');

// Security and parsing middleware
app.use(helmet());
app.use(express.json({ limit: '10mb' })); // Increase limit for base64 images
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Template engine setup
app.engine('ejs', ejs.renderFile);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Logging
app.use(morgan(function (tokens, req, res) {
  return [
    tokens.method(req, res),
    tokens.url(req, res),
    tokens.status(req, res),
    tokens.res(req, res, 'content-length'), '-',
    tokens['response-time'](req, res), 'ms'
  ].join(' ');
}));

// Updated CORS configuration
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001', // Add other local ports you might use
  'https://uniserver-4hkz.onrender.com',
  'https://unishare.com',
  process.env.FRONTEND_URL
].filter(Boolean);

// Enhanced CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl requests, etc.)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin); // Debug log
      return callback(new Error(`Not allowed by CORS: ${origin}`));
    }
  },
  credentials: true, // This is crucial for sessions
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  // Add these for better session handling
  optionsSuccessStatus: 200,
  preflightContinue: false
}));

// Session & Passport (ORDER MATTERS!)
app.use(session(sessionConfig));
app.use(passport.initialize());
app.use(passport.session());

// Debug middleware - add this after passport session setup
app.use((req, res, next) => {
  console.log('=== Session Debug ===');
  console.log('Session ID:', req.sessionID);
  console.log('Session exists:', !!req.session);
  console.log('Is authenticated:', req.isAuthenticated ? req.isAuthenticated() : 'N/A');
  console.log('User in session:', req.user ? req.user.id : 'None');
  console.log('Origin:', req.get('origin'));
  console.log('Cookies:', req.headers.cookie);
  console.log('====================');
  next();
});

// API Routes
app.use('/auth', authRoutes);
app.use('/api/rooms', roomRoutes); // Add room API routes

// Serve static files (if needed for uploaded photos fallback)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Main page route
app.get('/', (req, res) => {
  res.render('index', {
    title: 'UniShare',
    userName: req.user ? req.user.name : 'Guest',
    user: req.user || null,
    accessMessage: req.user ? 
      '✅ Welcome back!' : 
      '⚠️ ACCESS DENIED: Unauthorized users cannot access this site'
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'UniShare API',
    version: '1.0.0',
    endpoints: {
      rooms: {
        'POST /api/rooms': 'Create a new room posting',
        'GET /api/rooms': 'Get all room postings (paginated)',
        'GET /api/rooms/:id': 'Get a specific room by ID'
      },
      auth: {
        'GET /auth/google': 'Start Google OAuth flow',
        'GET /auth/google/callback': 'Google OAuth callback',
        'GET /auth/logout': 'Logout user'
      }
    }
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  // CORS error
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'CORS policy violation',
      details: 'Origin not allowed'
    });
  }
  
  // Default error response
  res.status(500).json({ 
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log("🚀 Server is Running on:", process.env.BACKEND_URL || `http://localhost:${PORT}`);
  console.log("📊 Environment:", process.env.NODE_ENV || 'development');
});