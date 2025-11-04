const express = require('express');
const router = express.Router();
const digitalSignature = require('../utils/signatureUtils');
const axios = require('axios');

// Helper function to send callback
async function sendCallback(callbackData) {
    try {
        const signedCallback = digitalSignature.createSignedXML(callbackData);
        
        // Get callback URL from environment or use a default
        const callbackUrl = process.env.ESS_CALLBACK_URL || 'http://localhost:3000/api/callback';
        
        console.log('📤 Sending callback:', {
            url: callbackUrl,
            messageType: callbackData.Header.MessageType
        });

        const response = await axios({
            method: 'post',
            url: callbackUrl,
            headers: {
                'Content-Type': 'application/xml'
            },
            data: signedCallback,
            timeout: 30000
        });

        console.log('✅ Callback sent successfully:', {
            status: response.status,
            messageType: callbackData.Header.MessageType
        });

        return response;
    } catch (error) {
        console.error('❌ Error sending callback:', error.message);
        throw error;
    }
}

module.exports = { sendCallback };