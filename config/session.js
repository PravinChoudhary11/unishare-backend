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
      // Enhanced error logging
      errorLog: (err) => {
        console.error('🔴 Session store error:', err?.message || err || 'Unknown error');
        console.error('🔴 Full error:', err);
      },
      // Connection pool settings for Supabase
      pool: {
        max: 5,
        min: 1,
        acquireTimeoutMillis: 30000,
        createTimeoutMillis: 30000,
        destroyTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        createRetryIntervalMillis: 200,
        reapIntervalMillis: 1000,
      }
    });

    // Test the connection
    sessionStore.query('SELECT NOW()', (err, result) => {
      if (err) {
        console.error('🔴 Session store connection test failed:', err.message);
        sessionStore = null; // Fall back to memory store
      } else {
        console.log('✅ Session store connected successfully');
      }
    });

  } catch (error) {
    console.error('❌ Failed to setup PostgreSQL session store:', error.message);
    sessionStore = null;
  }
}

// Check if frontend is on Vercel (cross-origin HTTPS)
const frontendUrl = process.env.FRONTEND_URL || '';
const isVercelFrontend = frontendUrl.includes('vercel.app') || frontendUrl.includes('https://');

// If session store failed, log warning and use memory store
if (isProduction && !sessionStore) {
  console.warn('⚠️  PostgreSQL session store failed, falling back to memory store');
  console.warn('⚠️  This means sessions will not persist across server restarts');
}

module.exports = {
  store: sessionStore, // Will be null if connection failed, Express will use memory store
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
    return require('crypto').randomBytes(32).toString('hex');
  }
};