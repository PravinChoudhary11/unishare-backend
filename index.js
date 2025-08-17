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
const cors = require('cors');

// Security and parsing middleware
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true, // important to allow cookies
}));

// Session & Passport (ORDER MATTERS!)
app.use(session(sessionConfig));
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/auth', authRoutes);

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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log("Server is Running on:", process.env.BACKEND_URL || `http://localhost:${PORT}`);
});
