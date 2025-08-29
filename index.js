// Enhanced index.js - CORS fix for Vercel production

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const helmet = require('helmet');
const sessionConfig = require('./config/session');
const passport = require('./config/passport');
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');

const app = express();
const PORT = process.env.PORT || 4000;
const isProduction = process.env.NODE_ENV === 'production';

// Trust proxy for Render deployment
app.set('trust proxy', 1);

// Security middleware - relaxed for cross-origin
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS Configuration for Vercel frontend
const allowedOrigins = [
  'http://localhost:3000',
  'https://localhost:3000',
  'https://unishare-eight.vercel.app', // Your Vercel domain
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL_PROD
].filter(Boolean);

console.log('🔧 CORS Configuration:');
console.log('- Environment:', isProduction ? 'production' : 'development');
console.log('- Allowed origins:', allowedOrigins);

// Enhanced CORS for production cross-origin requests
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin in development
    if (!isProduction && !origin) {
      return callback(null, true);
    }
    
    if (!origin || allowedOrigins.includes(origin)) {
      console.log('✅ CORS allowed for origin:', origin || 'no-origin');
      callback(null, true);
    } else {
      console.warn('❌ CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // CRITICAL for cross-origin cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'x-requested-with',
    'Origin',
    'Accept',
    'Cookie'
  ],
  exposedHeaders: ['Set-Cookie'],
  optionsSuccessStatus: 200,
  maxAge: 86400 // Cache preflight for 1 day
}));

// Pre-flight request handler
app.options('*', (req, res) => {
  console.log('🔄 OPTIONS preflight from:', req.get('Origin'));
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session middleware - MUST come before passport
app.use(session(sessionConfig));

// Enhanced session debugging
app.use((req, res, next) => {
  const isAuthRoute = req.path.startsWith('/auth');
  
  if (isAuthRoute || !isProduction) {
    console.log('=== Session Debug ===');
    console.log('Session ID:', req.sessionID);
    console.log('Session exists:', !!req.session);
    console.log('Is authenticated:', req.isAuthenticated ? req.isAuthenticated() : 'N/A');
    console.log('User in session:', req.user?.id || 'None');
    console.log('Origin:', req.get('Origin'));
    console.log('User-Agent:', req.get('User-Agent')?.substring(0, 50) + '...');
    console.log('Cookies:', req.get('Cookie'));
    console.log('Referer:', req.get('Referer'));
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
    origin: req.get('Origin')
  });
});

app.use('/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Global error:', err.message);
  
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'CORS Error',
      message: 'Origin not allowed',
      origin: req.get('Origin'),
      allowedOrigins: allowedOrigins
    });
  }
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on: http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL}`);
});