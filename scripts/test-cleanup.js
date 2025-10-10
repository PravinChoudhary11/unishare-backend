// scripts/test-cleanup.js - Manual cleanup testing script
require('dotenv').config();

const cleanupService = require('../services/cleanup');

async function testCleanup() {
  console.log('🧪 Testing cleanup service...');
  
  try {
    // Get service status
    console.log('\n📊 Service Status:');
    const status = cleanupService.getStatus();
    console.log(JSON.stringify(status, null, 2));
    
    // Run manual cleanup
    console.log('\n🧹 Running manual cleanup...');
    await cleanupService.runManualCleanup();
    
    console.log('\n✅ Cleanup test completed successfully');
    
  } catch (error) {
    console.error('\n❌ Cleanup test failed:', error);
  }
  
  process.exit(0);
}

testCleanup();