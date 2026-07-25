const fs = require('fs');
const https = require('https');
const logger = require('./logger');

// Initialize HTTPS agent with CA bundle
let httpsAgent = null;
let isInitialized = false;

/**
 * Initialize HTTPS agent with CA bundle from environment or default path
 */
function initializeHttpsAgent() {
    if (isInitialized && httpsAgent) {
        return httpsAgent;
    }

    try {
        const caBundlePath = process.env.UTUMISHI_CA_BUNDLE_PATH || '/opt/ess/keys/utumishi_ca_bundle.pem';
        
        if (fs.existsSync(caBundlePath)) {
            const ca = fs.readFileSync(caBundlePath, 'utf8');
            httpsAgent = new https.Agent({
                ca: ca,
                rejectUnauthorized: true,
                keepAlive: true,
                maxSockets: 10,
                timeout: 60000,
                freeSocketTimeout: 30000
            });
            logger.info('✅ HTTPS agent initialized with CA bundle from:', caBundlePath);
            isInitialized = true;
        } else {
            logger.warn('⚠️ CA bundle not found at:', caBundlePath);
            // Fallback to simple keep-alive agent
            httpsAgent = new https.Agent({
                keepAlive: true,
                maxSockets: 10,
                timeout: 60000,
                freeSocketTimeout: 30000
            });
            isInitialized = true;
        }
    } catch (error) {
        logger.error('❌ Error initializing HTTPS agent:', {
            message: error.message,
            stack: error.stack
        });
        // Fallback to default agent
        if (!httpsAgent) {
            httpsAgent = new https.Agent({
                keepAlive: true,
                maxSockets: 10,
                timeout: 60000,
                freeSocketTimeout: 30000
            });
        }
        isInitialized = true;
    }

    return httpsAgent;
}

/**
 * Get the initialized HTTPS agent
 */
function getHttpsAgent() {
    if (!isInitialized) {
        return initializeHttpsAgent();
    }
    return httpsAgent;
}

/**
 * Force reinitialize the HTTPS agent (useful for testing or configuration changes)
 */
function reinitializeHttpsAgent() {
    isInitialized = false;
    httpsAgent = null;
    return initializeHttpsAgent();
}

module.exports = {
    getHttpsAgent,
    initializeHttpsAgent,
    reinitializeHttpsAgent
};
