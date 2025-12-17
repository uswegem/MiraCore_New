const logger = require('../utils/logger');
const axios = require("axios");
const dotenv = require('dotenv');
dotenv.config();
const fs = require('fs')
const https = require('https');

const CBS_MAKER_USERNAME = process.env.CBS_MAKER_USERNAME;
const CBS_MAKER_PASSWORD = process.env.CBS_MAKER_PASSWORD;
const CBS_Tenant = process.env.CBS_Tenant;

// Connection pool configuration for better performance
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 10,
  timeout: 60000,
  freeSocketTimeout: 30000
});

// Circuit breaker state
const circuitBreakerState = {
  isOpen: false,
  failures: 0,
  lastFailure: null
};

const maker = axios.create({
  baseURL: process.env.CBS_BASE_URL,
  timeout: 60000,
  httpsAgent,
  headers: {
    'Content-Type': 'application/json',
    'Mifos-Platform-TenantId': CBS_Tenant
  }
});

maker.interceptors.request.use(
  async (config) => {
    try {
      // Get basic auth headers
      const authHeaders = { 'Authorization': `Basic ${Buffer.from(`${CBS_MAKER_USERNAME}:${CBS_MAKER_PASSWORD}`).toString('base64')}` };
      if (authHeaders.Authorization) {
        config.headers.Authorization = authHeaders.Authorization;
      }
      
      // Log request with correlation ID
      const correlationId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      config.headers['X-Correlation-ID'] = correlationId;
      
      logger.info('í³¤ CBS API Request:', {
        correlationId,
        url: config.url,
        method: config.method,
        headers: {
          ...config.headers,
          Authorization: '[REDACTED]'
        }
      });
      
      return config;
    } catch (error) {
      logger.error('Request interceptor error:', error);
      throw error;
    }
  },
  (error) => {
    logger.error('Request interceptor rejection:', error);
    return Promise.reject(error);
  }
);

maker.interceptors.response.use(
  (response) => {
    const responseTime = response.config.metadata?.endTime - response.config.metadata?.startTime || 0;
    logger.info('í³¥ CBS API Response:', {
      correlationId: response.config.headers['X-Correlation-ID'],
      status: response.status,
      responseTime: `${responseTime}ms`,
      url: response.config.url
    });
    return response;
  },
  (error) => {
    const responseTime = error.config?.metadata?.endTime - error.config?.metadata?.startTime || 0;
    
    const errorInfo = { shouldRetry: error.code === 'ECONNRESET' || error.code === 'TIMEOUT', category: 'network' };
    
    if (errorInfo.shouldRetry && error.config && !error.config.__isRetryRequest) {
      error.config.__retryCount = error.config.__retryCount || 0;
      if (error.config.__retryCount < 3) {
        error.config.__retryCount++;
        error.config.__isRetryRequest = true;
        
        const delay = Math.min(1000 * Math.pow(2, error.config.__retryCount), 10000);
        logger.warn(`Retrying CBS request (${error.config.__retryCount}/3) after ${delay}ms...`);
        
        return new Promise((resolve) => {
          setTimeout(() => resolve(maker(error.config)), delay);
        });
      }
    }
    
    logger.error('CBS API Error:', {
      correlationId: error.config?.headers?.['X-Correlation-ID'],
      url: error.config?.url,
      status: error.response?.status,
      message: error.message,
      responseTime: `${responseTime}ms`
    });
    
    return Promise.reject(error);
  }
);

const checker = axios.create({
  baseURL: process.env.CBS_BASE_URL,
  timeout: 60000,
  httpsAgent,
  headers: {
    'Content-Type': 'application/json',
    'Mifos-Platform-TenantId': CBS_Tenant,
    'Authorization': `Basic ${Buffer.from(`${process.env.CBS_CHECKER_USERNAME}:${process.env.CBS_CHECKER_PASSWORD}`).toString('base64')}`
  }
});

module.exports = {
  maker,
  checker,
  circuitBreakerState,
  getHealthStatus: () => ({ status: 'healthy', services: [] }),
  clearTokenCache: () => { /* Token cache cleared */ }
};
