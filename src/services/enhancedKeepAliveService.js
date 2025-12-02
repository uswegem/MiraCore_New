const axios = require('axios');
const https = require('https');
const { execSync } = require('child_process');

class EnhancedKeepAliveService {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.keepAliveInterval = 2 * 60 * 1000; // 2 minutes (more frequent)
    this.utumishiEndpoint = process.env.UTUMISHI_ENDPOINT || 'http://154.118.230.140:9802';
    this.lastSuccessfulPing = null;
    this.consecutiveFailures = 0;
    this.maxFailures = 3; // Trigger recovery after 3 failures
    this.recoveryInProgress = false;
    this.totalPings = 0;
    this.successfulPings = 0;

    // Enhanced axios instance with better connection management
    this.axiosInstance = axios.create({
      timeout: 15000, // 15 seconds timeout
      httpsAgent: new https.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 10,
        rejectUnauthorized: false
      }),
      headers: {
        'Connection': 'keep-alive',
        'User-Agent': 'ESS-Enhanced-KeepAlive/2.0',
        'Cache-Control': 'no-cache'
      },
      // Retry configuration
      retry: {
        retries: 3,
        retryDelay: (retryCount) => retryCount * 1000
      }
    });
  }

  /**
   * Start the enhanced keep-alive service
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ Keep-alive service is already running');
      return;
    }

    console.log(`🚀 Starting Enhanced Keep-Alive Service for ${this.utumishiEndpoint}`);
    console.log(`📡 Ping interval: ${this.keepAliveInterval / 1000} seconds`);
    console.log(`🔧 Max failures before recovery: ${this.maxFailures}`);
    
    this.isRunning = true;
    this.consecutiveFailures = 0;
    this.recoveryInProgress = false;
    
    // Send initial ping
    this.sendEnhancedKeepAlivePing();
    
    // Set up periodic pings
    this.intervalId = setInterval(() => {
      if (!this.recoveryInProgress) {
        this.sendEnhancedKeepAlivePing();
      }
    }, this.keepAliveInterval);

    console.log('✅ Enhanced keep-alive service started successfully');
  }

  /**
   * Stop the enhanced keep-alive service
   */
  stop() {
    if (!this.isRunning) {
      console.log('⚠️ Keep-alive service is not running');
      return;
    }

    console.log('🛑 Stopping enhanced keep-alive service...');
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    this.isRunning = false;
    this.recoveryInProgress = false;
    console.log('✅ Enhanced keep-alive service stopped');
  }

  /**
   * Send enhanced keep-alive ping with multiple strategies
   */
  async sendEnhancedKeepAlivePing() {
    const timestamp = new Date().toISOString();
    this.totalPings++;
    
    try {
      console.log(`📡 [${timestamp}] Sending enhanced keep-alive ping...`);
      
      // Strategy 1: Multiple endpoint testing
      const success = await this.testMultipleEndpoints();
      
      if (success) {
        this.handlePingSuccess();
      } else {
        throw new Error('All endpoints failed');
      }

    } catch (error) {
      await this.handlePingFailure(error);
    }
  }

  /**
   * Test multiple endpoints for better reliability
   */
  async testMultipleEndpoints() {
    const endpoints = [
      `${this.utumishiEndpoint}/ess-loans/mvtyztwq/consume`,
      `${this.utumishiEndpoint}/ess-loans/health`,
      `${this.utumishiEndpoint}/ess-loans/ping`,
      `${this.utumishiEndpoint}/ess-loans/status`
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await this.axiosInstance.head(endpoint);
        console.log(`✅ Endpoint responsive: ${endpoint} (${response.status})`);
        return true;
      } catch (error) {
        console.log(`❌ Endpoint failed: ${endpoint} - ${error.code || error.message}`);
        continue;
      }
    }

    // If all specific endpoints fail, try basic connectivity
    try {
      const response = await this.axiosInstance.get(`${this.utumishiEndpoint}`, {
        timeout: 5000,
        validateStatus: () => true // Accept any response
      });
      console.log(`✅ Basic connectivity confirmed (${response.status})`);
      return true;
    } catch (error) {
      console.log(`❌ Basic connectivity failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Handle successful ping
   */
  handlePingSuccess() {
    this.lastSuccessfulPing = new Date();
    this.consecutiveFailures = 0;
    this.successfulPings++;
    
    const uptime = ((this.successfulPings / this.totalPings) * 100).toFixed(2);
    console.log(`💚 Keep-alive successful (${uptime}% uptime)`);
    
    // Reset recovery flag if it was set
    if (this.recoveryInProgress) {
      console.log('🎉 Recovery successful - service back to normal');
      this.recoveryInProgress = false;
    }
  }

  /**
   * Handle ping failure with enhanced recovery
   */
  async handlePingFailure(error) {
    this.consecutiveFailures++;
    const timestamp = new Date().toISOString();
    
    console.log(`❌ [${timestamp}] Keep-alive failed (${this.consecutiveFailures}/${this.maxFailures})`);
    console.log(`   Error: ${error.message || error.code}`);
    
    // Escalating response based on failure count
    if (this.consecutiveFailures === 1) {
      console.log('🔍 First failure - monitoring closely');
    } else if (this.consecutiveFailures === 2) {
      console.log('⚠️ Second consecutive failure - preparing recovery');
      await this.performQuickDiagnostics();
    } else if (this.consecutiveFailures >= this.maxFailures && !this.recoveryInProgress) {
      console.log('🚨 CRITICAL: Maximum failures reached - triggering recovery');
      await this.triggerAutomaticRecovery();
    }
  }

  /**
   * Perform quick diagnostics
   */
  async performQuickDiagnostics() {
    console.log('🔧 Performing quick diagnostics...');
    
    try {
      // Check IPSec tunnel status
      const ipsecOutput = execSync('sudo ipsec status', { 
        encoding: 'utf8', 
        timeout: 5000 
      });
      
      const tunnelCount = (ipsecOutput.match(/ESTABLISHED|INSTALLED/g) || []).length;
      console.log(`📊 IPSec tunnels active: ${tunnelCount}`);
      
      if (tunnelCount < 4) {
        console.log('⚠️ IPSec tunnel degradation detected');
      }
      
      // Test basic network connectivity
      execSync(`ping -c 1 -W 3 154.118.230.140`, { 
        encoding: 'utf8',
        timeout: 5000 
      });
      console.log('✅ Basic network connectivity confirmed');
      
    } catch (error) {
      console.log(`❌ Diagnostics failed: ${error.message}`);
    }
  }

  /**
   * Trigger automatic recovery procedures
   */
  async triggerAutomaticRecovery() {
    if (this.recoveryInProgress) {
      console.log('🔄 Recovery already in progress, skipping');
      return;
    }

    this.recoveryInProgress = true;
    console.log('🚨 INITIATING AUTOMATIC RECOVERY SEQUENCE');
    
    try {
      // Step 1: Network connectivity check
      console.log('🔍 Step 1: Checking network connectivity...');
      await this.checkNetworkConnectivity();
      
      // Step 2: IPSec tunnel recovery
      console.log('🔧 Step 2: Attempting IPSec tunnel recovery...');
      await this.restartIPSecTunnel();
      
      // Step 3: Wait for stabilization
      console.log('⏳ Step 3: Waiting for connection stabilization...');
      await this.sleep(30000);
      
      // Step 4: Verify recovery
      console.log('✅ Step 4: Verifying recovery...');
      const recoverySuccess = await this.testMultipleEndpoints();
      
      if (recoverySuccess) {
        console.log('🎉 RECOVERY SUCCESSFUL - Service restored');
        this.consecutiveFailures = 0;
        this.recoveryInProgress = false;
      } else {
        console.log('❌ RECOVERY FAILED - Manual intervention required');
        this.sendCriticalAlert();
      }
      
    } catch (error) {
      console.log(`❌ Recovery process failed: ${error.message}`);
      this.sendCriticalAlert();
    }
  }

  /**
   * Check basic network connectivity
   */
  async checkNetworkConnectivity() {
    try {
      execSync('ping -c 3 -W 5 154.118.230.140', { 
        encoding: 'utf8',
        timeout: 10000 
      });
      console.log('✅ Network connectivity verified');
      return true;
    } catch (error) {
      console.log('❌ Network connectivity failed');
      throw error;
    }
  }

  /**
   * Restart IPSec tunnel
   */
  async restartIPSecTunnel() {
    try {
      console.log('🔄 Restarting IPSec tunnel...');
      execSync('sudo ipsec restart', { 
        encoding: 'utf8',
        timeout: 30000 
      });
      
      // Wait for tunnel establishment
      await this.sleep(20000);
      
      // Verify tunnel status
      const status = execSync('sudo ipsec status', { 
        encoding: 'utf8',
        timeout: 5000 
      });
      
      const tunnelCount = (status.match(/ESTABLISHED|INSTALLED/g) || []).length;
      
      if (tunnelCount >= 4) {
        console.log(`✅ IPSec tunnel restored (${tunnelCount} connections)`);
        return true;
      } else {
        throw new Error(`Insufficient tunnels: ${tunnelCount}/4`);
      }
      
    } catch (error) {
      console.log(`❌ IPSec restart failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send critical alert
   */
  sendCriticalAlert() {
    const alert = {
      timestamp: new Date().toISOString(),
      service: 'EnhancedKeepAliveService',
      level: 'CRITICAL',
      message: 'Automatic recovery failed - Utumishi connectivity lost',
      consecutiveFailures: this.consecutiveFailures,
      lastSuccess: this.lastSuccessfulPing,
      uptime: ((this.successfulPings / this.totalPings) * 100).toFixed(2) + '%',
      recommendation: 'Check VPN connection, network infrastructure, and Utumishi service status'
    };

    console.log('🚨 CRITICAL ALERT:', JSON.stringify(alert, null, 2));
    
    // TODO: Implement alerting mechanisms:
    // - Email notification
    // - SMS alert
    // - Slack webhook
    // - Push notification
    // - Database logging
  }

  /**
   * Get comprehensive service status
   */
  getStatus() {
    const uptime = this.totalPings > 0 ? ((this.successfulPings / this.totalPings) * 100).toFixed(2) : 0;
    
    return {
      isRunning: this.isRunning,
      lastSuccessfulPing: this.lastSuccessfulPing,
      consecutiveFailures: this.consecutiveFailures,
      maxFailures: this.maxFailures,
      keepAliveInterval: this.keepAliveInterval,
      utumishiEndpoint: this.utumishiEndpoint,
      recoveryInProgress: this.recoveryInProgress,
      statistics: {
        totalPings: this.totalPings,
        successfulPings: this.successfulPings,
        failedPings: this.totalPings - this.successfulPings,
        uptime: `${uptime}%`
      }
    };
  }

  /**
   * Force manual recovery
   */
  async forceRecovery() {
    console.log('🔧 Manual recovery triggered');
    await this.triggerAutomaticRecovery();
  }

  /**
   * Update keep-alive interval
   */
  setInterval(intervalMs) {
    if (intervalMs < 30000) {
      console.log('⚠️ Minimum interval is 30 seconds');
      return false;
    }

    this.keepAliveInterval = intervalMs;
    
    if (this.isRunning) {
      console.log(`🔄 Updating interval to ${intervalMs / 1000} seconds`);
      this.stop();
      this.start();
    }
    
    return true;
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
const enhancedKeepAliveService = new EnhancedKeepAliveService();

module.exports = enhancedKeepAliveService;