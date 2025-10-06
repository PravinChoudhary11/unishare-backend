// utils/dbTest.js - Database connection test utility
const { Pool } = require('pg');

async function testDatabaseConnection() {
  if (!process.env.SUPABASE_DB_URL) {
    console.log('❌ No SUPABASE_DB_URL found');
    return false;
  }

  const pool = new Pool({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time');
    console.log('✅ Database connection successful:', result.rows[0].current_time);
    client.release();
    await pool.end();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    await pool.end();
    return false;
  }
}

module.exports = { testDatabaseConnection };