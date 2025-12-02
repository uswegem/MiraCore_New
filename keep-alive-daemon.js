// Enhanced Keep-Alive Daemon for ESS-Utumishi Connectivity
require('dotenv').config();

// Try to use enhanced service first, fallback to original
let keepAliveService;
try {
  keepAliveService = require('./src/services/enhancedKeepAliveService');
  console.log('🚀 Starting Enhanced ESS Keep-Alive Service...');
} catch (error) {
  keepAliveService = require('./src/services/keepAliveService');
  console.log('🚀 Starting ESS Keep-Alive Service (fallback)...');
}

console.log('════════════════════════════════════════════════════════════════');

// Display configuration
const config = {
  utumishiEndpoint: process.env.UTUMISHI_ENDPOINT || 'http://154.118.230.140:9802',
  keepAliveInterval: '2 minutes (enhanced)',
  environment: process.env.NODE_ENV || 'production',
  autoRecovery: 'enabled'
};

console.log('📋 Configuration:');
Object.entries(config).forEach(([key, value]) => {
  console.log(`   ${key}: ${value}`);
});

console.log('════════════════════════════════════════════════════════════════');

// Start the keep-alive service
keepAliveService.start();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  keepAliveService.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  keepAliveService.stop();
  process.exit(0);
});

// Keep the process running
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // Don't exit, just log the error
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit, just log the error
});

// Status monitoring endpoint (optional)
setInterval(() => {
  const status = keepAliveService.getStatus();
  if (status.consecutiveFailures > 0) {
    console.log(`⚠️ Service Status: ${status.consecutiveFailures} consecutive failures`);
  }
}, 60000); // Check every minute

console.log('✅ Keep-alive service is running...');
console.log('💡 Press Ctrl+C to stop the service');