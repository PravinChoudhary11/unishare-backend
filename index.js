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

// Route imports - Core system routes
const authRoutes = require('./routes/auth'); // Authentication routes (login, logout, register)
const adminRoutes = require('./routes/admin'); // Admin dashboard routes
const uploadRoutes = require('./routes/upload'); // File upload routes

// API Routes - User-facing routes (from /routes/api/)
const apiRoomRoutes = require('./routes/api/rooms');
const apiItemSellRoutes = require('./routes/api/itemsell');
const apiTicketSellRoutes = require('./routes/api/ticketsell');
const apiLostFoundRoutes = require('./routes/api/lostfound');
const apiShareRideRoutes = require('./routes/api/shareride');
const apiAnnouncementRoutes = require('./routes/api/announcements');
const apiNoticeRoutes = require('./routes/api/notice');
const apiContactRoutes = require('./routes/api/contacts');
const apiResourceRoutes = require('./routes/api/resources');
const apiNotificationRoutes = require('./routes/api/notifications');

// Admin Routes - Admin management routes (from /routes/admin/)
const adminSharerideRoutes = require('./routes/admin/shareride');
const adminTicketsellRoutes = require('./routes/admin/ticketsell');
const adminItemsellRoutes = require('./routes/admin/itemsell');
const adminRoomsRoutes = require('./routes/admin/rooms');
const adminLostfoundRoutes = require('./routes/admin/lostfound');
const adminAnnouncementRoutes = require('./routes/admin/announcements');
const adminResourceRoutes = require('./routes/admin/resources');
const adminContactRoutes = require('./routes/admin/contacts');
const adminNoticeRoutes = require('./routes/admin/notice');
const adminNotificationRoutes = require('./routes/admin/notifications');

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


// Core System Routes
app.use('/auth', authRoutes); // Authentication routes (login, logout, register)
app.use('/admin', adminRoutes); // Admin dashboard routes
app.use('/upload', uploadRoutes); // File upload routes

// =========================
// API Routes (User Access - Own Data Only + Public Read)
// =========================
app.use('/api/rooms', apiRoomRoutes);
app.use('/api/itemsell', apiItemSellRoutes);
app.use('/api/ticketsell', apiTicketSellRoutes);
app.use('/api/lostfound', apiLostFoundRoutes);
app.use('/api/shareride', apiShareRideRoutes);
app.use('/api/notice', apiNoticeRoutes); // PUBLIC: Notice viewing only
app.use('/api/announcements', apiAnnouncementRoutes); // PUBLIC: Announcements viewing  
app.use('/api/resources', apiResourceRoutes); // PUBLIC: Resources viewing + suggestion system
app.use('/api/contacts', apiContactRoutes); // PUBLIC: Contacts directory viewing
app.use('/api/notifications', apiNotificationRoutes); // USER: Personal notifications management

// =========================
// Admin Routes (Admin Access - All Data with Full CRUD)
// =========================

app.use('/admin/shareride', adminSharerideRoutes);
app.use('/admin/ticketsell', adminTicketsellRoutes); 
app.use('/admin/itemsell', adminItemsellRoutes);
app.use('/admin/rooms', adminRoomsRoutes);
app.use('/admin/lostfound', adminLostfoundRoutes);
app.use('/admin/announcements', adminAnnouncementRoutes);
app.use('/admin/resources', adminResourceRoutes);
app.use('/admin/contacts', adminContactRoutes);
app.use('/admin/notice', adminNoticeRoutes);
app.use('/admin/notifications', adminNotificationRoutes); // ADMIN: Notification management & broadcasting

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
