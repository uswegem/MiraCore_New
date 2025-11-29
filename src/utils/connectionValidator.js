const axios = require('axios');
const https = require('https');
const keepAliveService = require('./keepAliveService');

/**
 * Utility for ensuring Utumishi connectivity before making requests
 */
class ConnectionValidator {
  constructor() {
    this.utumishiEndpoint = process.env.UTUMISHI_ENDPOINT || 'https://154.118.230.140';
    this.timeout = 5000; // 5 seconds
    this.maxRetries = 2;
    
    // Create axios instance for validation
    this.axiosInstance = axios.create({
      timeout: this.timeout,
      httpsAgent: new https.Agent({
        keepAlive: true,
        rejectUnauthorized: false
      }),
      headers: {
        'Connection': 'keep-alive',
        'User-Agent': 'ESS-ConnectionValidator/1.0'
      }
    });
  }

  /**
   * Validate connection to Utumishi before making a request
   * @returns {Promise<boolean>} True if connection is valid
   */
  async validateConnection() {
    try {
      console.log(`🔍 Validating connection to ${this.utumishiEndpoint}...`);
      
      const response = await this.axiosInstance.get(this.utumishiEndpoint, {
        timeout: this.timeout
      });
      
      console.log(`✅ Connection validated - Status: ${response.status}`);
      return true;
      
    } catch (error) {
      console.log(`❌ Connection validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Ensure connection is available, with automatic reconnection attempt
   * @returns {Promise<boolean>} True if connection is ready
   */
  async ensureConnection() {
    console.log('🔗 Ensuring Utumishi connectivity...');
    
    // First, try to validate current connection
    const isValid = await this.validateConnection();
    
    if (isValid) {
      console.log('✅ Connection is already active');
      return true;
    }
    
    console.log('🔄 Connection appears down, attempting to re-establish...');
    
    // Try to trigger keep-alive ping to re-establish connection
    try {
      await keepAliveService.ping();
      
      // Wait a moment and test again
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const isValidAfterPing = await this.validateConnection();
      if (isValidAfterPing) {
        console.log('✅ Connection re-established via keep-alive');
        return true;
      }
    } catch (error) {
      console.log(`⚠️ Keep-alive ping failed: ${error.message}`);
    }
    
    // If still failing, try manual IPSec reconnection
    console.log('🔧 Attempting IPSec tunnel reconnection...');
    
    try {
      await this.reconnectIPSecTunnel();
      
      // Wait for tunnel to establish
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const isValidAfterReconnect = await this.validateConnection();
      if (isValidAfterReconnect) {
        console.log('✅ Connection restored via IPSec reconnection');
        return true;
      }
    } catch (error) {
      console.log(`❌ IPSec reconnection failed: ${error.message}`);
    }
    
    console.log('❌ Failed to establish connection to Utumishi');
    return false;
  }

  /**
   * Attempt to reconnect IPSec tunnel
   * @returns {Promise<void>}
   */
  async reconnectIPSecTunnel() {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    console.log('🔧 Reconnecting IPSec tunnel...');
    
    try {
      // First, bring down existing tunnel
      console.log('📤 Bringing down existing tunnel...');
      await execAsync('sudo ipsec down utumishi-tunnel', { timeout: 10000 });
      
      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Bring up the tunnel
      console.log('📥 Bringing up tunnel...');
      const { stdout, stderr } = await execAsync('sudo ipsec up utumishi-tunnel', { timeout: 15000 });
      
      if (stderr && stderr.includes('ERROR')) {
        throw new Error(`IPSec error: ${stderr}`);
      }
      
      console.log('✅ IPSec tunnel reconnection completed');
      console.log('📋 Output:', stdout);
      
    } catch (error) {
      console.log(`❌ IPSec reconnection error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Enhanced request wrapper that ensures connection before sending
   * @param {Function} requestFn - Function that makes the actual request
   * @param {number} retries - Number of retry attempts
   * @returns {Promise<any>} Request result
   */
  async requestWithEnsuredConnection(requestFn, retries = this.maxRetries) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      console.log(`📡 Request attempt ${attempt}/${retries}...`);
      
      // Ensure connection before making request
      const connectionReady = await this.ensureConnection();
      
      if (!connectionReady) {
        if (attempt === retries) {
          throw new Error('Unable to establish connection to Utumishi after all attempts');
        }
        console.log(`⏳ Waiting before retry attempt ${attempt + 1}...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }
      
      try {
        // Make the actual request
        console.log('📤 Making request to Utumishi...');
        const result = await requestFn();
        
        console.log('✅ Request completed successfully');
        return result;
        
      } catch (error) {
        console.log(`❌ Request failed on attempt ${attempt}: ${error.message}`);
        
        if (attempt === retries) {
          throw error;
        }
        
        // Check if it's a network error that might benefit from reconnection
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
          console.log('🔄 Network error detected, will retry with connection validation...');
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  /**
   * Get connection status
   * @returns {Promise<Object>} Connection status info
   */
  async getConnectionStatus() {
    const isValid = await this.validateConnection();
    const keepAliveStatus = keepAliveService.getStatus();
    
    return {
      isConnected: isValid,
      endpoint: this.utumishiEndpoint,
      lastValidated: new Date().toISOString(),
      keepAliveService: keepAliveStatus
    };
  }
}

// Export singleton instance
const connectionValidator = new ConnectionValidator();

module.exports = connectionValidator;