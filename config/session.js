// config/session.js
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);

module.exports = {
  store: new pgSession({
    conString: process.env.SUPABASE_DB_URL, // Supabase Postgres connection string
    tableName: "session",                   // default name; can change if needed
    createTableIfMissing: true              // auto-create session table
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // required on Render
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    domain: process.env.NODE_ENV === "production" ? ".onrender.com" : "localhost",
    maxAge: 24 * 60 * 60 * 1000 // 1 day
  }
};
