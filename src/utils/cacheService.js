const redis = require('redis');
const logger = require('./logger');

class CacheService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.init();
  }

  async init() {
    if (process.env.NODE_ENV === 'test') {
      this.isConnected = false;
      return;
    }

    try {
      this.client = redis.createClient({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            logger.error('Redis connection refused');
            return new Error('Redis connection refused');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            logger.error('Redis retry time exhausted');
            return new Error('Retry time exhausted');
          }
          if (options.attempt > 10) {
            logger.error('Redis max retry attempts reached');
            return undefined;
          }
          // Reconnect after
          return Math.min(options.attempt * 100, 3000);
        }
      });

      this.client.on('connect', () => {
        logger.info('✅ Redis connected');
        this.isConnected = true;
      });

      this.client.on('error', (err) => {
        logger.error('❌ Redis error:', err.message);
        this.isConnected = false;
      });

      this.client.on('ready', () => {
        logger.info('✅ Redis ready');
      });

      await this.client.connect();
    } catch (error) {
      logger.warn('Redis not available, caching disabled:', error.message);
      this.isConnected = false;
    }
  }

  async get(key) {
    if (!this.isConnected) return null;

    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis get error:', error.message);
      return null;
    }
  }

  async set(key, value, ttl = 3600) {
    if (!this.isConnected) return false;

    try {
      await this.client.setEx(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error('Redis set error:', error.message);
      return false;
    }
  }

  async del(key) {
    if (!this.isConnected) return false;

    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error('Redis del error:', error.message);
      return false;
    }
  }

  async clear(pattern = '*') {
    if (!this.isConnected) return false;

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      return true;
    } catch (error) {
      logger.error('Redis clear error:', error.message);
      return false;
    }
  }

  // Loan calculation specific caching
  async getLoanCalculation(key) {
    return this.get(`loan_calc:${key}`);
  }

  async setLoanCalculation(key, data, ttl = 1800) { // 30 minutes
    return this.set(`loan_calc:${key}`, data, ttl);
  }

  // Client data caching
  async getClientData(clientId) {
    return this.get(`client:${clientId}`);
  }

  async setClientData(clientId, data, ttl = 3600) { // 1 hour
    return this.set(`client:${clientId}`, data, ttl);
  }

  // API response caching
  async getApiResponse(endpoint, params) {
    const key = `api:${endpoint}:${JSON.stringify(params)}`;
    return this.get(key);
  }

  async setApiResponse(endpoint, params, data, ttl = 300) { // 5 minutes
    const key = `api:${endpoint}:${JSON.stringify(params)}`;
    return this.set(key, data, ttl);
  }

  async close() {
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
    }
  }
}

module.exports = new CacheService();