// config/session.js - FIXED VERSION for cross-origin cookies
const session = require("express-session");
const isProduction = process.env.NODE_ENV === "production";

let sessionStore;
let shouldUsePGStore = isProduction && process.env.SUPABASE_DB_URL;

if (shouldUsePGStore) {
  try {
    const pgSession = require("connect-pg-simple")(session);
    
    // Create session store with enhanced configuration
    sessionStore = new pgSession({
      conString: process.env.SUPABASE_DB_URL + '?sslmode=require',
      tableName: "session",
      createTableIfMissing: true,
      schemaName: "public",
      pruneSessionInterval: 60,
      // Enhanced error logging with fallback protection
      errorLog: (err) => {
        console.error('🔴 Session store error:', err?.message || err || 'Unknown error');
        
        // If we get too many errors, we might want to disable the store
        if (err?.message?.includes('ECONNREFUSED') || err?.message?.includes('timeout')) {
          console.warn('� Database connection issues detected. Sessions may not persist across restarts.');
        }
      },
      // Connection pool settings optimized for Supabase
      pool: {
        max: 3, // Reduced for Render's resource limits
        min: 0, // Allow pool to scale down to 0
        acquireTimeoutMillis: 15000, // Reduced timeout
        createTimeoutMillis: 15000,
        destroyTimeoutMillis: 3000,
        idleTimeoutMillis: 10000, // Shorter idle timeout
        createRetryIntervalMillis: 500,
        reapIntervalMillis: 2000,
      }
    });

    console.log('✅ PostgreSQL session store configured');

    // Handle session store events (if supported)
    if (typeof sessionStore.on === 'function') {
      sessionStore.on('connect', () => {
        console.log('🟢 Session store connected successfully');
      });

      sessionStore.on('error', (err) => {
        console.error('🔴 Session store event error:', err.message);
      });
    }

  } catch (error) {
    console.error('❌ Failed to setup PostgreSQL session store:', error.message);
    console.warn('🟡 Falling back to memory store');
    sessionStore = null;
    shouldUsePGStore = false;
  }
}

// Check if frontend is on Vercel (cross-origin HTTPS)
const frontendUrl = process.env.FRONTEND_URL || '';
const isVercelFrontend = frontendUrl.includes('vercel.app') || frontendUrl.includes('https://');

// Log session store status
if (shouldUsePGStore && sessionStore) {
  console.log('📊 Session store: PostgreSQL (persistent)');
} else {
  console.log('📊 Session store: Memory (non-persistent)');
  if (isProduction) {
    console.warn('⚠️  Using memory sessions in production - sessions will not persist across restarts');
  }
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