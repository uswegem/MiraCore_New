const express = require('express');
const router = express.Router();
const apiController = require('../controllers/apiController');
const api = require('../services/cbs.api');
const disbursementUtils = require('../utils/disbursementUtils');
const digitalSignature = require('../utils/signatureUtils');
const xml2js = require('xml2js');
const loanStatusController = require('../controllers/loanStatusController');

// Main API endpoint for loan-related requests
router.post('/loan', apiController.processRequest);

// Webhook endpoint for MIFOS notifications (bypass signature verification)
router.post('/webhook/mifos', apiController.handleMifosWebhook);

// Endpoint to manually trigger loan disbursement notification
router.post('/loan/disburse', async (req, res) => {
    try {
        const result = await disbursementUtils.sendDisbursementNotification(req.body);
        res.json({ success: true, message: 'Disbursement notification sent successfully', result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint for Postman collection to generate signatures
router.post('/sign', async (req, res) => {
    try {
        // Parse the incoming XML string into an object
        const parser = new xml2js.Parser({ explicitArray: false });
        const parsedXml = await parser.parseStringPromise(req.body);
        
        // Extract the Data part (createSignedXML expects just the Data object)
        const dataToSign = parsedXml.Document.Data;
        
        // Generate signed XML
        const signedXML = digitalSignature.createSignedXML(dataToSign);
        res.status(200).send(signedXML);
    } catch (error) {
        console.error('Error in /api/sign:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Single endpoint for all frontend requests
router.post('/loan', apiController.processRequest);

// Temporary endpoint to check ClientType codes
router.get('/client-types', async (req, res) => {
    try {
        const response = await api.get('/v1/codes/ClientType/codevalues');
        res.json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



// Generic endpoint to manually trigger supported outgoing messages from admin portal
const outgoingMessagesController = require('../controllers/outgoingMessagesController');
router.post('/outgoing-message', outgoingMessagesController.triggerOutgoingMessage);

// Endpoint to manually trigger LOAN_STATUS_REQUEST from admin portal
router.post('/loan-status-request', loanStatusController.triggerLoanStatusRequest);

module.exports = router;



