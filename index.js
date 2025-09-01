// Enhanced index.js - CORS fix for Vercel production + Secure Image Upload
require('dotenv').config(); // must be first
const supabase = require('./config/supabase');

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const helmet = require('helmet');
const sessionConfig = require('./config/session');
const passport = require('./config/passport');

// Route imports
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const itemSellRoutes = require('./routes/itemsell');
const uploadRoutes = require('./routes/upload'); // NEW: Secure upload routes

const app = express();
const PORT = process.env.PORT || 4000;
const isProduction = process.env.NODE_ENV === 'production';

// Trust proxy for deployment
app.set('trust proxy', 1);

// Security middleware - relaxed for cross-origin
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Enhanced CORS configuration
const allowedOrigins = [
  'http://localhost:3000',
  'https://localhost:3000',
  'https://unishare-eight.vercel.app', // Your Vercel domain
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL_PROD
].filter(Boolean);

console.log('CORS Configuration:');
console.log('- Environment:', isProduction ? 'production' : 'development');
console.log('- Allowed origins:', allowedOrigins);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin in development (mobile apps, Postman, etc.)
    if (!isProduction && !origin) {
      return callback(null, true);
    }
    
    if (!origin || allowedOrigins.includes(origin)) {
      console.log('CORS allowed for origin:', origin || 'no-origin');
      callback(null, true);
    } else {
      console.warn('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // CRITICAL: Enable credentials (cookies)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'x-requested-with',
    'Origin',
    'Accept',
    'Cookie',
    'Set-Cookie'
  ],
  exposedHeaders: ['Set-Cookie'], // Allow frontend to see Set-Cookie header
  optionsSuccessStatus: 200, // For legacy browser support
  preflightContinue: false, // Pass control to the next handler
  maxAge: 86400 // Cache preflight for 1 day
}));

// Enhanced pre-flight handler
app.options('*', (req, res) => {
  console.log('OPTIONS preflight from:', req.get('Origin'));
  console.log('Request credentials:', req.get('Cookie') ? 'present' : 'none');
  
  // Explicitly set CORS headers for preflight
  res.header('Access-Control-Allow-Origin', req.get('Origin'));
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-requested-with,Origin,Accept,Cookie,Set-Cookie');
  res.header('Access-Control-Expose-Headers', 'Set-Cookie');
  res.sendStatus(200);
});

// Body parsing - IMPORTANT: Order matters for multipart handling
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session middleware - MUST come before passport
app.use(session(sessionConfig));

// Enhanced session debugging
app.use((req, res, next) => {
  const isAuthRoute = req.path.startsWith('/auth') || req.path.startsWith('/itemsell') || req.path.startsWith('/upload');
  
  if (isAuthRoute || !isProduction) {
    console.log('=== Session Debug ===');
    console.log('Session ID:', req.sessionID);
    console.log('Session exists:', !!req.session);
    console.log('Is authenticated:', req.isAuthenticated ? req.isAuthenticated() : 'N/A');
    console.log('User in session:', req.user?.id || 'None');
    console.log('Route:', req.method, req.path);
    console.log('Origin:', req.get('Origin'));
    console.log('====================');
  }
  next();
});

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Unishare Backend API',
    status: 'running',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    authenticated: req.isAuthenticated ? req.isAuthenticated() : false,
    user: req.user ? req.user.id : null,
    sessionID: req.sessionID,
    origin: req.get('Origin'),
    features: {
      authentication: 'Google OAuth',
      imageUpload: 'Secure backend upload to Supabase',
      roomListings: 'CRUD operations',
      itemMarketplace: 'CRUD operations'
    },
    routes: [
      'GET /',
      // Auth routes
      'POST /auth/google',
      'GET /auth/google/callback',
      'GET /auth/me',
      'GET /auth/logout',
      'GET /auth/health',
      // Room routes
      'GET /api/rooms',
      'POST /api/rooms',
      'GET /api/rooms/my-rooms',
      'GET /api/rooms/:id',
      'PUT /api/rooms/:id',
      'DELETE /api/rooms/:id',
      // Item marketplace routes
      'GET /itemsell',
      'POST /itemsell',
      'GET /itemsell/mine',
      'GET /itemsell/:id',
      'PUT /itemsell/:id',
      'DELETE /itemsell/:id',
      // Secure upload routes
      'POST /upload/item-image',
      'DELETE /upload/item-image'
    ]
  });
});

// Mount routes
app.use('/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/itemsell', itemSellRoutes);
app.use('/upload', uploadRoutes); // NEW: Secure upload routes

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error:', err.message);
  
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'CORS Error',
      message: 'Origin not allowed',
      origin: req.get('Origin'),
      allowedOrigins: allowedOrigins
    });
  }
  
  // Handle multer errors globally
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      error: 'File too large',
      message: 'Maximum file size is 5MB'
    });
  }
  
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      success: false,
      error: 'Unexpected file',
      message: 'Invalid file field'
    });
  }
  
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    availableRoutes: [
      'GET /',
      'POST /auth/google',
      'GET /auth/google/callback',  
      'GET /auth/me',
      'GET /auth/logout',
      'GET /api/rooms',
      'POST /api/rooms',
      'GET /api/rooms/my-rooms',
      'GET /api/rooms/:id',
      'PUT /api/rooms/:id',
      'DELETE /api/rooms/:id',
      'GET /itemsell',
      'POST /itemsell',
      'GET /itemsell/mine', 
      'GET /itemsell/:id',
      'PUT /itemsell/:id',
      'DELETE /itemsell/:id',
      'POST /upload/item-image',
      'DELETE /upload/item-image'
    ]
  });
});

app.listen(PORT, () => {
  console.log(`Server running on: http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Frontend URL: ${process.env.FRONTEND_URL}`);
  console.log('Available endpoints:');
  console.log('   - Rooms: /api/rooms/*');
  console.log('   - Auth: /auth/*');
  console.log('   - Items: /itemsell/*');
  console.log('   - Upload: /upload/* (NEW - Secure image uploads)');
  console.log('Security Features:');
  console.log('   ✅ Backend-only Supabase credentials');
  console.log('   ✅ Secure image upload through backend');
  console.log('   ✅ User ownership verification');
  console.log('   ✅ File validation and cleanup');
});