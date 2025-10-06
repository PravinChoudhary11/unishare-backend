// Create sessions table in Supabase using the API
require('dotenv').config();
const supabase = require('./config/supabase');

async function createSessionsTable() {
  console.log('🔍 Creating sessions table in Supabase...');
  
  try {
    // Create the sessions table using Supabase's SQL execution
    const { data, error } = await supabase.rpc('sql', {
      query: `
        CREATE TABLE IF NOT EXISTS public.sessions (
          sid VARCHAR NOT NULL COLLATE "default",
          sess JSON NOT NULL,
          expire TIMESTAMP(6) NOT NULL
        );
        
        ALTER TABLE public.sessions 
        ADD CONSTRAINT sessions_pkey 
        PRIMARY KEY (sid);
        
        CREATE INDEX IF NOT EXISTS IDX_sessions_expire 
        ON public.sessions (expire);
      `
    });

    if (error) {
      console.error('❌ Failed to create sessions table:', error.message);
      console.log('\n💡 Manual solution:');
      console.log('1. Go to your Supabase dashboard');
      console.log('2. Navigate to SQL Editor');
      console.log('3. Run the SQL script in: sql/create_sessions_table.sql');
      return;
    }

    console.log('✓ Sessions table created successfully');
    
    // Test if we can insert a test session
    const testSession = {
      sid: 'test-session-id',
      sess: { test: true },
      expire: new Date(Date.now() + 1000 * 60 * 60) // 1 hour from now
    };

    const { data: insertData, error: insertError } = await supabase
      .from('sessions')
      .upsert(testSession);

    if (insertError) {
      console.error('❌ Failed to test session insertion:', insertError.message);
    } else {
      console.log('✓ Test session inserted successfully');
      
      // Clean up test session
      await supabase
        .from('sessions')
        .delete()
        .eq('sid', 'test-session-id');
      
      console.log('✓ Test session cleaned up');
    }

  } catch (error) {
    console.error('❌ Error creating sessions table:', error.message);
    console.log('\n💡 Manual solution:');
    console.log('1. Go to your Supabase dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Run the SQL script in: sql/create_sessions_table.sql');
  }
}

// Run the creation
createSessionsTable().catch(console.error);