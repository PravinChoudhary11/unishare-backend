// config/session.js - FIXED VERSION
const session = require("express-session");

const isProduction = process.env.NODE_ENV === "production";
let sessionStore;

if (isProduction && process.env.SUPABASE_DB_URL) {
  // Production: Use PostgreSQL session store
  try {
    const pgSession = require("connect-pg-simple")(session);
    
    sessionStore = new pgSession({
      conString: process.env.SUPABASE_DB_URL,
      tableName: "session",
      createTableIfMissing: true,
      schemaName: "public",
      pruneSessionInterval: 60, // Clean up expired sessions every 60 seconds
      errorLog: (err) => {
        console.error('Session store error:', err.message);
      }
    });

    console.log('🔧 Configured PostgreSQL session store for production');

  } catch (error) {
    console.error('❌ Failed to setup PostgreSQL session store:', error.message);
    console.error('⚠️  Falling back to memory store (NOT RECOMMENDED for production)');
    sessionStore = null; // Will use default memory store
  }
} else {
  // Development: Use memory store with warning
  console.log('⚠️  Using memory session store (DEVELOPMENT ONLY)');
  console.log('⚠️  For production, set NODE_ENV=production and provide SUPABASE_DB_URL');
}

module.exports = {
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'fallback-secret-key-change-in-production',
  resave: false,
  saveUninitialized: true, // CHANGED: Need this for OAuth flow
  name: 'unishare.sid',
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: false, // CHANGED: Set to false for development
    sameSite: 'lax', // CHANGED: Use 'lax' for development
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
  // Custom session ID generator
  genid: (req) => {
    const id = require('crypto').randomBytes(32).toString('hex');
    if (!isProduction) {
      console.log('🔑 Generated session ID:', id);
    }
    return id;
  }
};