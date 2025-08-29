// config/session.js (unchanged - still using SQLite for sessions)
const path = require('path');
const session = require('express-session');
const fs = require('fs');
const sessionsDir = path.join(__dirname, './sessions');
if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir);

const SQLiteStore = require('connect-sqlite3')(session);

module.exports = {
  store: new SQLiteStore({ 
  db: 'sessions.sqlite', 
  dir: sessionsDir,
  ttl: 24 * 60 * 60,               // session lifetime in seconds (1 day)
  checkExpirationInterval: 1 * 60 // how often to remove expired sessions (seconds)
}),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // true on Render
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    domain: process.env.NODE_ENV === "production" ? ".onrender.com" : "localhost",
    maxAge: 24 * 60 * 60 * 1000
  }
};