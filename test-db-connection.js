// Test database connection to Supabase
require('dotenv').config();
const { Pool } = require('pg');

async function testDatabaseConnection() {
  console.log('🔍 Testing Supabase database connection...');
  
  if (!process.env.SUPABASE_DB_URL) {
    console.error('❌ SUPABASE_DB_URL environment variable is missing');
    return;
  }

  const pool = new Pool({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: {
      rejectUnauthorized: false
    },
    max: 1,
    connectionTimeoutMillis: 10000,
  });

  try {
    // Test basic connection
    const client = await pool.connect();
    console.log('✓ Successfully connected to Supabase PostgreSQL');
    
    // Test if sessions table exists
    const tableResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'sessions'
      );
    `);
    
    const sessionTableExists = tableResult.rows[0].exists;
    console.log(`Sessions table exists: ${sessionTableExists ? '✓ Yes' : '❌ No'}`);
    
    if (!sessionTableExists) {
      console.log('📝 You need to create the sessions table in Supabase');
      console.log('📝 Run the SQL script in: sql/create_sessions_table.sql');
    }
    
    // Test basic query
    const result = await client.query('SELECT NOW() as current_time');
    console.log('✓ Database query successful:', result.rows[0].current_time);
    
    client.release();
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('Full error:', error);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.log('💡 Connection refused - check if:');
      console.log('   - SUPABASE_DB_URL is correct');
      console.log('   - Supabase project is active');
      console.log('   - Network allows connections to Supabase');
    }
  } finally {
    await pool.end();
  }
}

// Run the test
testDatabaseConnection().catch(console.error);