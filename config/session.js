// config/session.js - FIXED VERSION for cross-origin cookies
const session = require("express-session");
const isProduction = process.env.NODE_ENV === "production";

let sessionStore;
if (isProduction && process.env.SUPABASE_DB_URL) {
  try {
    const pgSession = require("connect-pg-simple")(session);
    
    sessionStore = new pgSession({
      conString: process.env.SUPABASE_DB_URL,
      tableName: "session",
      createTableIfMissing: true,
      schemaName: "public",
      pruneSessionInterval: 60,
      errorLog: (err) => {
        console.error('Session store error:', err.message);
      }
    });
    console.log('🔧 Configured PostgreSQL session store for production');
  } catch (error) {
    console.error('❌ Failed to setup PostgreSQL session store:', error.message);
    sessionStore = null;
  }
} else {
  console.log('⚠️  Using memory session store (DEVELOPMENT ONLY)');
}

// Check if frontend is on Vercel (cross-origin HTTPS)
const frontendUrl = process.env.FRONTEND_URL || '';
const isVercelFrontend = frontendUrl.includes('vercel.app') || frontendUrl.includes('https://');


module.exports = {
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'fallback-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false, // Don't create sessions for unauthenticated users
  name: 'unishare.sid', // Custom session name
  rolling: false, // Don't extend session on every request
  cookie: {
    httpOnly: true,
    secure: isProduction && isVercelFrontend, // HTTPS required for cross-origin
    sameSite: isVercelFrontend ? 'none' : 'lax', // 'none' required for cross-origin
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    domain: undefined // Let browser handle domain automatically
  },
  genid: (req) => {
    const id = require('crypto').randomBytes(32).toString('hex');
    console.log('🔑 Generated session ID:', id);
    return id;
  }
};