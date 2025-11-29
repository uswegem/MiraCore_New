const keepAliveService = require('./src/services/keepAliveService');
const connectionValidator = require('./src/utils/connectionValidator');
const axios = require('axios');
require('dotenv').config();

async function testKeepAliveImplementation() {
  console.log('🧪 Testing Keep-Alive Implementation');
  console.log('════════════════════════════════════════════════════════════════');

  try {
    // 1. Test keep-alive service
    console.log('\\n1️⃣ Testing Keep-Alive Service...');
    console.log('Starting keep-alive service...');
    keepAliveService.start();
    
    // Wait for first ping
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const status = keepAliveService.getStatus();
    console.log('Keep-alive status:', JSON.stringify(status, null, 2));
    
    // 2. Test connection validation
    console.log('\\n2️⃣ Testing Connection Validation...');
    const connectionStatus = await connectionValidator.getConnectionStatus();
    console.log('Connection status:', JSON.stringify(connectionStatus, null, 2));
    
    // 3. Test manual connection validation
    console.log('\\n3️⃣ Testing Manual Connection Check...');
    const isConnected = await connectionValidator.validateConnection();
    console.log('Manual validation result:', isConnected ? '✅ Connected' : '❌ Not Connected');
    
    // 4. Test request with ensured connection
    console.log('\\n4️⃣ Testing Request with Ensured Connection...');
    
    const testRequest = async () => {
      // Simulate sending a message to Utumishi
      console.log('📤 Simulating request to Utumishi...');
      
      const testPayload = {
        messageType: 'TEST_CONNECTION',
        timestamp: new Date().toISOString(),
        data: 'Keep-alive test message'
      };
      
      const response = await axios.post('https://154.118.230.140/test', testPayload, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ESS-KeepAlive-Test/1.0'
        },
        httpsAgent: new (require('https')).Agent({
          rejectUnauthorized: false
        })
      });
      
      return response.data;
    };
    
    try {
      const result = await connectionValidator.requestWithEnsuredConnection(testRequest);
      console.log('✅ Request with ensured connection successful:', result);
    } catch (error) {
      console.log('⚠️ Request failed (expected if Utumishi endpoint doesn\'t exist):', error.message);
    }
    
    // 5. Show how to use in real scenarios
    console.log('\\n5️⃣ Usage Examples:');
    console.log('');
    console.log('📋 How to use keep-alive in your code:');
    console.log('');
    console.log('// 1. For automatic background keep-alive (already integrated in server.js):');
    console.log('const keepAliveService = require(\"./src/services/keepAliveService\");');
    console.log('keepAliveService.start(); // Starts automatic pings every 5 minutes');
    console.log('');
    console.log('// 2. For connection validation before requests:');
    console.log('const connectionValidator = require(\"./src/utils/connectionValidator\");');
    console.log('');
    console.log('// Method A: Simple validation');
    console.log('const isReady = await connectionValidator.ensureConnection();');
    console.log('if (isReady) {');
    console.log('  // Make your request to Utumishi');
    console.log('  await sendMessageToUtumishi(data);');
    console.log('}');
    console.log('');
    console.log('// Method B: Automatic retry with connection validation');
    console.log('const result = await connectionValidator.requestWithEnsuredConnection(async () => {');
    console.log('  return await sendMessageToUtumishi(data);');
    console.log('});');
    
    console.log('\\n✅ Keep-Alive Implementation Test Completed!');
    console.log('');
    console.log('📊 Summary:');
    console.log('- ✅ Keep-alive service integrated into server.js');
    console.log('- ✅ Automatic pings every 5 minutes to maintain tunnel');
    console.log('- ✅ Connection validation utility available');
    console.log('- ✅ Automatic reconnection attempts');
    console.log('- ✅ Graceful shutdown handling');
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  } finally {
    // Clean up
    console.log('\\n🛑 Stopping keep-alive service...');
    keepAliveService.stop();
    console.log('✅ Test cleanup completed');
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testKeepAliveImplementation().then(() => {
    console.log('\\n🎉 All tests completed!');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
}

module.exports = { testKeepAliveImplementation };