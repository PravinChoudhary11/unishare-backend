// Test the session configuration
require('dotenv').config();

// Set production environment for testing
process.env.NODE_ENV = 'production';

const sessionConfig = require('./config/session');

console.log('🔍 Testing session configuration...');
console.log('Environment:', process.env.NODE_ENV);
console.log('Session store type:', sessionConfig.store ? sessionConfig.store.constructor.name : 'Memory (default)');

if (sessionConfig.store) {
  console.log('✓ Session store configured successfully');
  
  // Test basic session operations if using Supabase store
  if (sessionConfig.store.constructor.name === 'SupabaseSessionStore') {
    console.log('\n🧪 Testing Supabase session store operations...');
    
    const testSession = {
      user: { id: 'test-user', email: 'test@example.com' },
      loginTime: new Date().toISOString()
    };
    
    const testSid = 'test-session-' + Date.now();
    
    // Test set operation
    sessionConfig.store.set(testSid, testSession, (err) => {
      if (err) {
        console.error('❌ Session set failed:', err.message);
      } else {
        console.log('✓ Session set successful');
        
        // Test get operation
        sessionConfig.store.get(testSid, (err, retrievedSession) => {
          if (err) {
            console.error('❌ Session get failed:', err.message);
          } else {
            console.log('✓ Session get successful');
            console.log('📄 Retrieved session:', retrievedSession);
            
            // Test destroy operation
            sessionConfig.store.destroy(testSid, (err) => {
              if (err) {
                console.error('❌ Session destroy failed:', err.message);
              } else {
                console.log('✓ Session destroy successful');
                console.log('🎉 All session operations working correctly!');
              }
            });
          }
        });
      }
    });
  }
} else {
  console.log('⚠️  Using memory store (sessions will not persist across restarts)');
}

console.log('\n📋 Session Configuration Summary:');
console.log('- Secret:', sessionConfig.secret ? '[CONFIGURED]' : '[MISSING]');
console.log('- Store:', sessionConfig.store ? sessionConfig.store.constructor.name : 'Memory (default)');
console.log('- Secure cookies:', sessionConfig.cookie.secure);
console.log('- SameSite:', sessionConfig.cookie.sameSite);
console.log('- Max age:', sessionConfig.cookie.maxAge, 'ms');