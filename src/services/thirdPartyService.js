const axios = require('axios');
const digitalSignature = require('../utils/signatureUtils');

const THIRD_PARTY_BASE_URL = process.env.THIRD_PARTY_BASE_URL;
const API_TIMEOUT = parseInt(process.env.API_TIMEOUT) || 30000;

async function forwardToThirdParty(signedXml, messageType) {
  try {
    console.log(' Preparing to send to ESS...');
    
    // Check if URL is configured
    if (!THIRD_PARTY_BASE_URL) {
      throw new Error('THIRD_PARTY_BASE_URL environment variable is not set');
    }

    // Validate URL format
    try {
      new URL(THIRD_PARTY_BASE_URL);
    } catch (urlError) {
      throw new Error(`Invalid THIRD_PARTY_BASE_URL: ${THIRD_PARTY_BASE_URL}`);
    }

    console.log('Target ESS URL:', THIRD_PARTY_BASE_URL);
    console.log('Message Type:', messageType);
    console.log('Signed XML Size:', signedXml.length, 'characters');

    const config = {
      method: 'post',
      url: THIRD_PARTY_BASE_URL,
      data: signedXml,
      headers: {
        'Content-Type': 'application/xml',
        'Accept': 'application/xml',
        'User-Agent': 'Miracore-Backend/1.0'
      },
      timeout: API_TIMEOUT,
      // Add more debugging info
      validateStatus: function (status) {
        return status >= 200 && status < 600; // Accept all status codes for debugging
      }
    };

    console.log(' Sending signed request to ESS...');
    
    const response = await axios(config);
    
    console.log(`ESS Response Status: ${response.status}`);
    console.log('ESS Response Headers:', JSON.stringify(response.headers));
    
    if (response.data) {
      console.log('ESS Response Body Length:', response.data.length, 'characters');
      console.log('ESS Response Body (first 500 chars):', response.data.substring(0, 500));
    } else {
      console.log('ESS Response: No body');
    }
    
    return response.data;

  } catch (error) {
    console.error('ESS Communication Error:');
    
    if (error.code === 'ENOTFOUND') {
      throw new Error(`Cannot connect to ESS: ${error.hostname} not found`);
    } else if (error.code === 'ECONNREFUSED') {
      throw new Error(`ESS connection refused: ${THIRD_PARTY_BASE_URL}`);
    } else if (error.response) {
      // ESS responded with error status
      console.log('ESS Error Response Details:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data ? error.response.data.substring(0, 500) : 'No data'
      });
      
      // If ESS returns XML error, return it directly
      if (error.response.data && typeof error.response.data === 'string') {
        return error.response.data;
      }
      
      throw new Error(`ESS responded with status: ${error.response.status} - ${error.response.statusText}`);
    } else if (error.request) {
      console.log('No response received from ESS');
      throw new Error('No response received from ESS - connection timeout or network issue');
    } else {
      console.log('Request setup error:', error.message);
      throw error;
    }
  }
}

module.exports = {
  forwardToThirdParty
};