// Test Supabase API connection and check existing session table
require('dotenv').config();
const supabase = require('./config/supabase');

async function testSupabaseApi() {
  console.log('🔍 Testing Supabase API connection...');
  
  try {
    // Test 1: Check if "session" table exists (singular)
    console.log('1. Checking if session table exists (singular)...');
    
    const { data, error } = await supabase
      .from('session')
      .select('*')
      .limit(1);

    if (error) {
      if (error.code === 'PGRST205') {
        console.log('❌ No session table found (neither singular nor plural)');
        console.log('✓ But Supabase API connection is working');
        await showCreateTableInstructions();
      } else {
        console.error('❌ API connection failed:', error.message);
        console.error('Full error:', error);
      }
    } else {
      console.log('✓ Found existing "session" table (singular)');
      console.log(`📊 Current sessions count: ${data.length}`);
      
      // Test session operations with the existing table
      await testSessionOperations('session');
    }

    // Also test with plural form
    console.log('\n2. Checking if sessions table exists (plural)...');
    const { data: dataPlural, error: errorPlural } = await supabase
      .from('sessions')
      .select('*')
      .limit(1);

    if (!errorPlural) {
      console.log('✓ Found existing "sessions" table (plural)');
      console.log(`📊 Current sessions count: ${dataPlural.length}`);
      await testSessionOperations('sessions');
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    console.error('Full error:', error);
  }
}

async function showCreateTableInstructions() {
  console.log('\n💡 You need to manually create the sessions table:');
  console.log('1. Go to https://supabase.com/dashboard');
  console.log('2. Select your project: rrdhgqcockacjqfuwyit');
  console.log('3. Go to SQL Editor');
  console.log('4. Run this SQL:');
  console.log(`
CREATE TABLE IF NOT EXISTS public.sessions (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS IDX_sessions_expire 
ON public.sessions (expire);

-- Enable RLS
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Policy to allow all operations (you can make this more restrictive)
CREATE POLICY "Allow all session operations" ON public.sessions
FOR ALL USING (true);
  `);
}

async function testSessionOperations(tableName) {
  try {
    console.log(`\n🧪 Testing session operations on "${tableName}" table...`);
    
    // Test session insertion
    const testSession = {
      sid: 'test-' + Date.now(),
      sess: { userId: 'test', loginTime: new Date().toISOString() },
      expire: new Date(Date.now() + 1000 * 60 * 60).toISOString() // 1 hour
    };
    
    const { data: insertData, error: insertError } = await supabase
      .from(tableName)
      .insert(testSession)
      .select();
    
    if (insertError) {
      console.error('❌ Session insertion failed:', insertError.message);
      console.error('Full insert error:', insertError);
    } else {
      console.log('✓ Session insertion successful');
      
      // Test session retrieval
      const { data: retrieveData, error: retrieveError } = await supabase
        .from(tableName)
        .select('*')
        .eq('sid', testSession.sid)
        .single();
      
      if (retrieveError) {
        console.error('❌ Session retrieval failed:', retrieveError.message);
      } else {
        console.log('✓ Session retrieval successful');
        console.log('📄 Retrieved session:', retrieveData);
        
        // Clean up
        const { error: deleteError } = await supabase
          .from(tableName)
          .delete()
          .eq('sid', testSession.sid);
        
        if (deleteError) {
          console.error('❌ Session cleanup failed:', deleteError.message);
        } else {
          console.log('✓ Test session cleaned up');
        }
      }
    }
    
  } catch (error) {
    console.error('Session operations error:', error.message);
    console.error('Full operations error:', error);
  }
}

// Run the test
testSupabaseApi().catch(console.error);