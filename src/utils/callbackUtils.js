const logger = require('./logger');

const express = require('express');
const router = express.Router();
const digitalSignature = require('../utils/signatureUtils');
const axios = require('axios');
const { getHttpsAgent } = require('../utils/httpsAgentManager');

const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

// Helper function to send callback with retry logic
async function sendCallback(callbackData) {
    // Skip callback in test mode
    if (process.env.NODE_ENV === 'test') {
        logger.info('📤 Skipping callback in test mode');
        return { status: 200, data: { success: true, message: 'Test mode - callback skipped' } };
    }

    let retryCount = 0;

    const isInvalidSignatureBusinessResponse = (responseData) => {
        const responseText = typeof responseData === 'string'
            ? responseData
            : JSON.stringify(responseData || {});
        return /<ResponseCode>\s*8009\s*<\/ResponseCode>/i.test(responseText) ||
               /"ResponseCode"\s*:\s*"?8009"?/i.test(responseText);
    };

    const sendSignedPayload = async (signedCallback, signingMode) => {
        const callbackUrl = process.env.THIRD_PARTY_BASE_URL || process.env.ESS_CALLBACK_URL || 'http://localhost:3000/api/callback';
        if (!callbackUrl) {
            throw new Error('THIRD_PARTY_BASE_URL is not configured in environment');
        }

        logger.info('📤 Sending callback:', {
            url: callbackUrl,
            messageType: callbackData.Data?.Header?.MessageType || callbackData.Header?.MessageType || 'UNKNOWN',
            signingMode,
            data: JSON.stringify(callbackData, null, 2)
        });

        logger.info('📝 Signed XML Payload:', signedCallback);

        const response = await axios({
            method: 'post',
            url: callbackUrl,
            headers: {
                'Content-Type': 'application/xml',
                'X-Request-ID': `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            },
            data: signedCallback,
            timeout: parseInt(process.env.API_TIMEOUT) || 30000,
            validateStatus: function (status) {
                return status >= 200 && status < 500;
            },
            httpsAgent: getHttpsAgent(),
            httpAgent: undefined
        });

        logger.info('📥 Callback response:', {
            status: response.status,
            statusText: response.statusText,
            messageType: callbackData.Data?.Header?.MessageType || callbackData.Header?.MessageType || 'UNKNOWN',
            signingMode,
            headers: response.headers,
            data: response.data
        });

        return response;
    };

    while (retryCount < MAX_RETRIES) {
        try {
            logger.info(`📤 Attempt ${retryCount + 1}/${MAX_RETRIES} to send callback`);
            const signedCallback = digitalSignature.createSignedXML(callbackData.Data);
            let response = await sendSignedPayload(signedCallback, 'data-element');

            if (response.status < 400 && isInvalidSignatureBusinessResponse(response.data)) {
                logger.warn('⚠️ ESS returned 8009 for primary signature, retrying with inner-data signature mode');
                const fallbackSignedCallback = digitalSignature.createSignedXML(callbackData.Data, { signInnerData: true });
                response = await sendSignedPayload(fallbackSignedCallback, 'data-inner');
            }

        if (response.status >= 400) {
            throw new Error(`Callback failed with status ${response.status}: ${response.statusText}`);
        }

        return response;
    } catch (error) {
        logger.error('❌ Error sending callback:', {
            message: error.message,
            stack: error.stack,
            responseData: error.response?.data,
            responseStatus: error.response?.status,
            responseHeaders: error.response?.headers
        });
        // If not the last attempt, wait before retrying
        if (retryCount < MAX_RETRIES - 1) {
            logger.info(`⏳ Waiting ${RETRY_DELAY}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            retryCount++;
            continue;
        }
        throw error;
    }
    break; // Success, exit retry loop
    }
}

module.exports = { sendCallback };