// index.js - FIXED VERSION
const dotenv = require('dotenv');
dotenv.config();

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

// Trust proxy for production deployments (like Render)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for now
  crossOriginEmbedderPolicy: false
}));

// CORS Configuration
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  process.env.FRONTEND_URL,
  'https://your-frontend-app.vercel.app',
  'https://your-custom-domain.com'
].filter(Boolean);

console.log('🔧 CORS allowed origins:', allowedOrigins);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn('❌ CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // IMPORTANT: Allow cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with'],
  optionsSuccessStatus: 200
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session middleware - MUST come before passport
app.use(session(sessionConfig));

// Debug middleware to log session info
app.use((req, res, next) => {
  console.log('=== Session Debug ===');
  console.log('Session ID:', req.sessionID);
  console.log('Session exists:', !!req.session);
  console.log('Is authenticated:', req.isAuthenticated ? req.isAuthenticated() : 'N/A');
  console.log('User in session:', req.user?.id || 'None');
  console.log('Origin:', req.get('Origin'));
  console.log('Cookies:', req.get('Cookie'));
  console.log('====================');
  next();
});

// Passport middleware - MUST come after session
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Unishare Backend API',
    status: 'running',
    authenticated: req.isAuthenticated ? req.isAuthenticated() : false,
    user: req.user ? req.user.id : null,
    sessionID: req.sessionID
  });
});

app.use('/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Global error:', err);
  
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'CORS Error',
      message: 'Origin not allowed'
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
    path: req.originalUrl
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is Running on: http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});