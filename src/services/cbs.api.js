const logger = require('../utils/logger');
const axios = require("axios");
const dotenv = require('dotenv');
dotenv.config();
const fs = require('fs')
const https = require('https');

// Import enhanced MIFOS services
const authManager = require('./mifosAuthManager');
const healthMonitor = require('./mifosHealthMonitor');
const errorHandler = require('./mifosErrorHandler');
const requestManager = require('./mifosRequestManager');

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

const api = axios.create({
  baseURL: process.env.CBS_BASE_URL,
  timeout: parseInt(process.env.CBS_TIMEOUT || '30000'), // 30s default, configurable
  httpsAgent: httpsAgent,
  headers: {
    "Content-Type": "application/json",
    "fineract-platform-tenantid": CBS_Tenant
  },
  auth: {
    username: CBS_MAKER_USERNAME,
    password: CBS_MAKER_PASSWORD
  },
  // Retry configuration
  retry: 3,
  retryDelay: (retryCount) => {
    return Math.pow(2, retryCount) * 1000; // Exponential backoff
  }
});

// Request interceptor with enhanced auth and rate limiting
api.interceptors.request.use(
  async (config) => {
    try {
      // Apply rate limiting
      await requestManager.makeRequest(async () => {
        // Get enhanced auth headers
        const authHeaders = await authManager.getAuthHeader();
        if (authHeaders.Authorization) {
          config.headers.Authorization = authHeaders.Authorization;
        }
        
        // Log request with correlation ID
        const correlationId = errorHandler.generateCorrelationId();
        config.headers['X-Correlation-ID'] = correlationId;
        
        logger.info('📤 CBS API Request:', {
          correlationId,
          url: config.url,
          method: config.method,
          headers: {
            ...config.headers,
            Authorization: '[REDACTED]' // Don't log auth header
          },
          data: config.data
        });
      });
      
      return config;
    } catch (error) {
      logger.error('❌ Request interceptor error:', error.message);
      return Promise.reject(error);
    }
  },
  (error) => Promise.reject(error)
);


// Circuit breaker state management
let circuitBreakerState = {
  isOpen: false,
  failureCount: 0,
  lastFailureTime: null,
  threshold: 5,
  timeout: 60000 // 1 minute
};

// Response interceptor with enhanced error handling and monitoring
api.interceptors.response.use(
  (response) => {
    // Reset circuit breaker on success
    circuitBreakerState.failureCount = 0;
    circuitBreakerState.isOpen = false;
    
    // Record successful request metrics
    const responseTime = Date.now() - (response.config.metadata?.startTime || Date.now());
    healthMonitor.recordRequest('success', responseTime, response.config.url);
    
    const correlationId = response.config.headers['X-Correlation-ID'];
    logger.info('📥 CBS API Response:', {
      correlationId,
      url: response.config.url,
      status: response.status,
      responseTime: `${responseTime}ms`,
      responseSize: JSON.stringify(response.data).length
    });
    return { status: true, message: 'Success', response: response.data }
  },
  async (error) => {
    const config = error.config;
    const correlationId = config?.headers?.['X-Correlation-ID'] || 'unknown';
    
    // Record failed request metrics
    const responseTime = Date.now() - (config?.metadata?.startTime || Date.now());
    healthMonitor.recordRequest('error', responseTime, config?.url);
    
    // Circuit breaker logic
    circuitBreakerState.failureCount++;
    if (circuitBreakerState.failureCount >= circuitBreakerState.threshold) {
      circuitBreakerState.isOpen = true;
      circuitBreakerState.lastFailureTime = Date.now();
      logger.error('🚨 CBS Circuit breaker OPEN - too many failures');
    }
    
    // Enhanced error classification and retry logic
    const errorInfo = errorHandler.classifyError(error);
    const shouldRetry = errorInfo.retryable &&
                       config && !config.__isRetryRequest && (config.__retryCount || 0) < 3;
    
    if (shouldRetry) {
      config.__retryCount = (config.__retryCount || 0) + 1;
      config.__isRetryRequest = true;
      
      const delay = errorHandler.getRetryDelay(config.__retryCount);
      logger.warn(`🔄 Retrying CBS request (${config.__retryCount}/3) after ${delay}ms`, {
        correlationId,
        errorType: errorInfo.type,
        url: config.url
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return api(config);
    }
    
    // Enhanced error logging
    errorHandler.logError(error, {
      correlationId,
      url: error.config?.url,
      method: error.config?.method,
      retryCount: config?.__retryCount || 0,
      errorType: errorInfo.type
    });
    
    if (error.response) {
      return { status: false, message: errorInfo.message, response: error.response.data, correlationId }
    }
    return Promise.reject({ message: error.message, correlationId, errorType: errorInfo.type });
  }
);


// Create a separate instance for checker operations
const checkerApi = axios.create({
  baseURL: process.env.CBS_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
    "fineract-platform-tenantid": CBS_Tenant
  },
  auth: {
    username: process.env.CBS_CHECKER_USERNAME,
    password: process.env.CBS_CHECKER_PASSWORD
  }
});

// Apply the same interceptors to checkerApi
checkerApi.interceptors.request.use(
  (config) => {
    logger.info('📤 CBS Checker API Request:', {
      url: config.url,
      method: config.method,
      headers: {
        ...config.headers,
        Authorization: '[REDACTED]' // Don't log auth header
      },
      data: config.data
    });
    return config;
  },
  (error) => Promise.reject(error)
);

checkerApi.interceptors.response.use(
  (response) => {
    logger.info('📥 CBS Checker API Response:', {
      url: response.config.url,
      status: response.status,
      data: response.data
    });
    return { status: true, message: 'Success', response: response.data }
  },
  (error) => {
    logger.error('❌ CBS Checker API Error:', {
      url: error.config?.url,
      method: error.config?.method,
      headers: error.config?.headers,
      data: error.config?.data,
      status: error.response?.status,
      error: error.response?.data || error.message
    });
    if (error.response) {
      return { status: false, message: 'Error', response: error.response.data }
    }
    return Promise.reject(error.message);
  }
);

// Start health monitoring
healthMonitor.startPeriodicHealthCheck();

module.exports = {
  maker: api,
  checker: checkerApi,
  // Enhanced service managers
  authManager,
  healthMonitor,
  errorHandler,
  requestManager,
  // Utility functions
  getHealthStatus: () => healthMonitor.getDetailedStatus(),
  clearTokenCache: () => authManager.clearTokens(),
  resetCircuitBreaker: () => {
    circuitBreakerState.isOpen = false;
    circuitBreakerState.failureCount = 0;
    circuitBreakerState.lastFailureTime = null;
  }
};
