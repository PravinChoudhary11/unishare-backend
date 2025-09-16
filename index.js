// Enhanced index.js - CORS fix for Vercel production + Secure Image Upload
require('dotenv').config(); // must be first
const supabase = require('./config/supabase');

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const helmet = require('helmet');
const sessionConfig = require('./config/session');
const passport = require('./config/passport');
const chalk = require('chalk');
const engine = require('ejs-mate');

// Route imports
const authRoutes = require('./routes/auth'); // Updated: separated auth routes (authentication only)
const adminRoutes = require('./routes/admin'); // NEW: Admin-only routes (users, analytics, reports, activity)
const roomRoutes = require('./routes/rooms');
const itemSellRoutes = require('./routes/itemsell');
const uploadRoutes = require('./routes/upload'); // NEW: Secure upload routes
const ticketSellRoutes = require('./routes/ticketsell'); // NEW: Ticket selling routes
const lostFoundRoutes = require('./routes/lostfound'); // NEW: Lost & Found routes
const shareRideRoutes = require('./routes/shareride'); // NEW: Share Ride routes
const announcementRoutes = require('./routes/announcements');
const noticeRoutes = require('./routes/notice'); // NEW: Notice bar management routes
const contactRoutes = require('./routes/contacts'); // NEW: Contact directory management routes
const resourceRoutes = require('./routes/resources'); // NEW: Resources directory management routes

const app = express();
const PORT = process.env.PORT || 4000;
const isProduction = process.env.NODE_ENV === 'production';

// Trust proxy for deployment
app.set('trust proxy', 1);
app.engine('ejs', engine);
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs'); // so you can render('index')

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
const allowedOrigins = [
  'http://localhost:3000',
  'https://unishare-eight.vercel.app', // Your Vercel domain
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL_PROD
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!isProduction && !origin) {
      return callback(null, true);
    }
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
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
  exposedHeaders: ['Set-Cookie'],
  optionsSuccessStatus: 200,
  preflightContinue: false,
  maxAge: 86400
}));

// Pre-flight handler (silent, no extra console logs)
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.get('Origin'));
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-requested-with,Origin,Accept,Cookie,Set-Cookie');
  res.header('Access-Control-Expose-Headers', 'Set-Cookie');
  res.sendStatus(200);
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session middleware
app.use(session(sessionConfig));

// Strapi-like request logger
app.use((req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;

    let statusColor = chalk.green;
    if (res.statusCode >= 400 && res.statusCode < 500) statusColor = chalk.yellow;
    if (res.statusCode >= 500) statusColor = chalk.red;

    console.log(
      `${chalk.cyan('API')} ${chalk.gray('|')} ` +
      `${chalk.magenta(req.method)} ${chalk.white(req.originalUrl)} ` +
      `${chalk.gray('|')} Status: ${statusColor(res.statusCode)} ` +
      `${chalk.gray('|')} ${chalk.blue(durationMs.toFixed(2) + ' ms')} ` +
      `${chalk.gray('|')} Time: ${chalk.gray(new Date().toISOString())}`
    );
  });

  next();
});

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Root route
app.get("/", (req, res) => {
  res.render("index", { 
    title: "UniShare Backend",
    accessMessage: "You have restricted access to this server.",
    userName: "Pravin" // replace dynamically if you have user data
  });
});


// Routes
app.use('/auth', authRoutes); // Authentication routes only
app.use('/admin', adminRoutes); // Admin-only routes (users, analytics, reports, activity)
app.use('/api/rooms', roomRoutes);
app.use('/itemsell', itemSellRoutes);
app.use('/upload', uploadRoutes);
app.use('/api/tickets', ticketSellRoutes);
app.use('/api/lostfound', lostFoundRoutes); // NEW: Lost & Found routes
app.use('/api/shareride', shareRideRoutes); // NEW: Share Ride routes
app.use('/admin/announcements', announcementRoutes);
app.use('/api/notice', noticeRoutes); // PUBLIC: Notice viewing + ADMIN: Notice management routes
app.use('/admin/contacts', contactRoutes); // NEW: Contact directory management routes
app.use('/admin/resources', resourceRoutes); // NEW: Resources directory management routes

// Public folder for serving static files (like uploaded images)
app.use(express.static('public'));

// Global error handler
app.use((err, req, res, next) => {
  let status = err.status || 500;

  if (err.message === 'Not allowed by CORS') {
    status = 403;
    return res.status(status).json({
      error: 'CORS Error',
      message: 'Origin not allowed',
      origin: req.get('Origin')
    });
  }

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

  res.status(status).json({
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
    method: req.method
  });
});

// Server start
app.listen(PORT, () => {
  console.log(`${chalk.green('✓')} Server running: ${chalk.cyan(`http://localhost:${PORT}`)}`);
  console.log(`${chalk.gray('Environment:')} ${chalk.yellow(process.env.NODE_ENV || 'development')}`);
});
