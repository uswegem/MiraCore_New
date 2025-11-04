const express = require('express');
const router = express.Router();
const digitalSignature = require('../utils/signatureUtils');
const axios = require('axios');

const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

// Helper function to send callback with retry logic
async function sendCallback(callbackData) {
    let retryCount = 0;
    while (retryCount < MAX_RETRIES) {
        try {
            const signedCallback = digitalSignature.createSignedXML(callbackData);
            console.log(`📤 Attempt ${retryCount + 1}/${MAX_RETRIES} to send callback`);
        
        // Get callback URL from environment or use a default
        const callbackUrl = process.env.ESS_CALLBACK_URL || 'http://localhost:3000/api/callback';
        
        // Use THIRD_PARTY_BASE_URL from environment
        const callbackUrl = process.env.THIRD_PARTY_BASE_URL;
        if (!callbackUrl) {
            throw new Error('THIRD_PARTY_BASE_URL is not configured in environment');
        }

        console.log('📤 Sending callback:', {
            url: callbackUrl,
            messageType: callbackData.Header.MessageType,
            data: JSON.stringify(callbackData, null, 2)
        });

        console.log('📝 Signed XML Payload:', signedCallback);

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
                return status >= 200 && status < 500; // Accept all responses to log them
            }
        });

        // Log the complete response information
        console.log('📥 Callback response:', {
            status: response.status,
            statusText: response.statusText,
            messageType: callbackData.Header.MessageType,
            headers: response.headers,
            data: response.data
        });

        if (response.status >= 400) {
            throw new Error(`Callback failed with status ${response.status}: ${response.statusText}`);
        }

        return response;
    } catch (error) {
        console.error('❌ Error sending callback:', {
            message: error.message,
            stack: error.stack,
            responseData: error.response?.data,
            responseStatus: error.response?.status,
            responseHeaders: error.response?.headers
        });
        // If not the last attempt, wait before retrying
        if (retryCount < MAX_RETRIES - 1) {
            console.log(`⏳ Waiting ${RETRY_DELAY}ms before retry...`);
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