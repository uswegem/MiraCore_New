const express = require('express');
const router = express.Router();
const apiController = require('../controllers/apiController');
const api = require('../services/cbs.api');
const disbursementUtils = require('../utils/disbursementUtils');

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

module.exports = router;



