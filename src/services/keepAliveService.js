const axios = require('axios');
const https = require('https');

class KeepAliveService {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.keepAliveInterval = 5 * 60 * 1000; // 5 minutes
    this.utumishiEndpoint = process.env.UTUMISHI_ENDPOINT || 'http://154.118.230.140:9802';
    this.lastSuccessfulPing = null;
    this.consecutiveFailures = 0;
    this.maxFailures = 3;

    // Create axios instance with custom config for keep-alive
    this.axiosInstance = axios.create({
      timeout: 10000, // 10 seconds timeout
      httpsAgent: new https.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000, // 30 seconds
        rejectUnauthorized: false // For self-signed certificates
      }),
      headers: {
        'Connection': 'keep-alive',
        'User-Agent': 'ESS-KeepAlive/1.0'
      }
    });
  }

  /**
   * Start the keep-alive service
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ Keep-alive service is already running');
      return;
    }

    console.log(`🚀 Starting keep-alive service for ${this.utumishiEndpoint}`);
    console.log(`📡 Ping interval: ${this.keepAliveInterval / 1000} seconds`);
    
    this.isRunning = true;
    this.consecutiveFailures = 0;
    
    // Send initial ping
    this.sendKeepAlivePing();
    
    // Set up periodic pings
    this.intervalId = setInterval(() => {
      this.sendKeepAlivePing();
    }, this.keepAliveInterval);

    console.log('✅ Keep-alive service started successfully');
  }

  /**
   * Stop the keep-alive service
   */
  stop() {
    if (!this.isRunning) {
      console.log('⚠️ Keep-alive service is not running');
      return;
    }

    console.log('🛑 Stopping keep-alive service...');
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    this.isRunning = false;
    console.log('✅ Keep-alive service stopped');
  }

  /**
   * Send keep-alive ping to Utumishi
   */
  async sendKeepAlivePing() {
    const timestamp = new Date().toISOString();
    
    try {
      console.log(`📡 [${timestamp}] Sending keep-alive ping to Utumishi...`);
      
      // Try multiple endpoints to maintain connection
      const endpoints = [
        `${this.utumishiEndpoint}/ess-loans/mvtyztwq/consume`,
        `${this.utumishiEndpoint}/ess-loans/health`,
        `${this.utumishiEndpoint}/ess-loans/ping`
      ];

      let success = false;
      let lastError = null;

      for (const endpoint of endpoints) {
        try {
          const response = await this.axiosInstance.get(endpoint);
          console.log(`✅ [${timestamp}] Keep-alive successful: ${endpoint} - Status: ${response.status}`);
          success = true;
          break;
        } catch (error) {
          lastError = error;
          // Try next endpoint
          continue;
        }
      }

      if (success) {
        this.lastSuccessfulPing = new Date();
        this.consecutiveFailures = 0;
        this.logSuccess();
      } else {
        throw lastError;
      }

    } catch (error) {
      this.consecutiveFailures++;
      console.log(`❌ [${timestamp}] Keep-alive failed (${this.consecutiveFailures}/${this.maxFailures}): ${error.message}`);
      
      if (this.consecutiveFailures >= this.maxFailures) {
        console.log('🚨 CRITICAL: Multiple keep-alive failures detected!');
        console.log('💡 IPSec tunnel may be down. Consider manual reconnection.');
        this.logCriticalFailure(error);
      }
      
      this.logFailure(error);
    }
  }

  /**
   * Get current status of keep-alive service
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastSuccessfulPing: this.lastSuccessfulPing,
      consecutiveFailures: this.consecutiveFailures,
      maxFailures: this.maxFailures,
      keepAliveInterval: this.keepAliveInterval,
      utumishiEndpoint: this.utumishiEndpoint
    };
  }

  /**
   * Log successful ping
   */
  logSuccess() {
    // You can enhance this to log to database or file
    if (process.env.NODE_ENV === 'development') {
      console.log('💚 Connection to Utumishi is healthy');
    }
  }

  /**
   * Log ping failure
   */
  logFailure(error) {
    // You can enhance this to log to database or send alerts
    console.log(`🔶 Keep-alive failure details:`);
    console.log(`   - Error: ${error.code || error.message}`);
    console.log(`   - Time: ${new Date().toISOString()}`);
    console.log(`   - Consecutive failures: ${this.consecutiveFailures}`);
  }

  /**
   * Log critical failure when max failures reached
   */
  logCriticalFailure(error) {
    const criticalMessage = {
      timestamp: new Date().toISOString(),
      service: 'KeepAliveService',
      level: 'CRITICAL',
      message: 'Multiple keep-alive failures to Utumishi',
      consecutiveFailures: this.consecutiveFailures,
      lastError: error.message,
      recommendation: 'Check IPSec tunnel status and network connectivity'
    };

    console.log('🚨 CRITICAL ALERT:', JSON.stringify(criticalMessage, null, 2));
    
    // TODO: Send alert via email/SMS/Slack
    // TODO: Log to monitoring system
    // TODO: Trigger automatic tunnel reconnection
  }

  /**
   * Force a manual keep-alive ping (for testing)
   */
  async ping() {
    return await this.sendKeepAlivePing();
  }

  /**
   * Update keep-alive interval
   */
  setInterval(intervalMs) {
    if (intervalMs < 30000) { // Minimum 30 seconds
      console.log('⚠️ Minimum keep-alive interval is 30 seconds');
      return false;
    }

    this.keepAliveInterval = intervalMs;
    
    if (this.isRunning) {
      console.log(`🔄 Updating keep-alive interval to ${intervalMs / 1000} seconds`);
      this.stop();
      this.start();
    }
    
    return true;
  }
}

// Export singleton instance
const keepAliveService = new KeepAliveService();

module.exports = keepAliveService;