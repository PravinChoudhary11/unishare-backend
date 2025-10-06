// config/session.js - FIXED VERSION for cross-origin cookies with Supabase API fallback
const session = require("express-session");
const isProduction = process.env.NODE_ENV === "production";

// Custom Supabase Session Store Class (inline to avoid separate file)
class SupabaseSessionStore {
  constructor(options = {}) {
    this.tableName = options.tableName || 'session';
    this.ttl = options.ttl || 7 * 24 * 60 * 60 * 1000; // 7 days in ms
    this.supabase = require('./supabase');
  }

  // Get session by ID
  async get(sid, callback) {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('sess, expire')
        .eq('sid', sid)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return callback(null, null);
        }
        return callback(error);
      }

      if (data.expire && new Date(data.expire) < new Date()) {
        await this.destroy(sid, () => {});
        return callback(null, null);
      }

      callback(null, data.sess);
    } catch (error) {
      callback(error);
    }
  }

  // Save/update session
  async set(sid, session, callback) {
    try {
      const expire = new Date(Date.now() + this.ttl);
      
      const { error } = await this.supabase
        .from(this.tableName)
        .upsert({
          sid: sid,
          sess: session,
          expire: expire.toISOString()
        });

      callback(error || null);
    } catch (error) {
      callback(error);
    }
  }

  // Delete session
  async destroy(sid, callback) {
    try {
      const { error } = await this.supabase
        .from(this.tableName)
        .delete()
        .eq('sid', sid);

      callback(error || null);
    } catch (error) {
      callback(error);
    }
  }

  // Touch session (update expire time)
  async touch(sid, session, callback) {
    try {
      const expire = new Date(Date.now() + this.ttl);
      
      const { error } = await this.supabase
        .from(this.tableName)
        .update({ expire: expire.toISOString() })
        .eq('sid', sid);

      callback(error || null);
    } catch (error) {
      callback(error);
    }
  }
}

let sessionStore;
if (isProduction) {
  try {
    // Primary: Use Supabase API store (more reliable than direct PostgreSQL)
    console.log('🔄 Setting up Supabase API session store...');
    sessionStore = new SupabaseSessionStore({
      tableName: 'session', // Use singular form - matches existing table
      ttl: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
    });
    console.log('✓ Supabase API session store configured');
  } catch (error) {
    console.error('❌ Failed to setup Supabase API session store:', error.message);
    
    // Fallback: Try PostgreSQL direct connection
    if (process.env.SUPABASE_DB_URL) {
      try {
        console.log('🔄 Falling back to PostgreSQL direct connection...');
        const pgSession = require("connect-pg-simple")(session);
        const { Pool } = require('pg');
        
        const pool = new Pool({
          connectionString: process.env.SUPABASE_DB_URL,
          ssl: {
            rejectUnauthorized: false
          },
          max: 3,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 10000,
        });
        
        sessionStore = new pgSession({
          pool: pool,
          tableName: "session", // Use singular form
          createTableIfMissing: false, // Don't try to create table
          schemaName: "public",
          pruneSessionInterval: 60 * 15,
          errorLog: (err) => {
            console.error('Session store error:', err?.message || 'Unknown error');
          },
          ttl: 7 * 24 * 60 * 60,
          disableTouch: false
        });

        console.log('✓ PostgreSQL session store configured as fallback');
      } catch (pgError) {
        console.error('❌ PostgreSQL fallback also failed:', pgError.message);
        console.log('🔄 Using memory store (sessions will not persist)');
        sessionStore = null;
      }
    } else {
      console.log('🔄 Using memory store (sessions will not persist)');
      sessionStore = null;
    }
  }
} else {
  console.log('🔄 Using memory store for sessions (development mode)');
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
    return require('crypto').randomBytes(32).toString('hex');
  }
};