const xml2js = require('xml2js');
const digitalSignature = require('./signatureUtils');

const builder = new xml2js.Builder({
  rootName: 'Document',
  renderOpts: { pretty: false }
});

function createSignedResponse(responseCode, description, additionalData = {}) {
  const responseObj = {
    Header: {
      Sender: 'ZE DONE',
      Receiver: 'ESS_UTUMISHI',
      FSPCode: 'FL8090',
      MsgId: generateMessageId(),
      MessageType: 'RESPONSE'
    },
    MessageDetails: {
      ResponseCode: responseCode,
      Description: description,
      ...additionalData
    }
  };

  return digitalSignature.createSignedXML(responseObj);
}

function generateMessageId() {
  return `ESS${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
}

function createSuccessResponse(description = 'Success', additionalData = {}) {
  return createSignedResponse('8000', description, additionalData);
}

function createErrorResponse(responseCode, description) {
  return createSignedResponse(responseCode, description);
}

// Legacy functions for backward compatibility
function createResponse(responseCode, description, additionalData = {}) {
  return createSignedResponse(responseCode, description, additionalData);
}

module.exports = {
  createResponse,
  createSignedResponse,
  createSuccessResponse,
  createErrorResponse,
  generateMessageId
};