const express = require('express');
const router = express.Router();
const apiController = require('../controllers/apiController');
const api = require('../services/cbs.api');

// Webhook endpoint for MIFOS notifications (bypass signature verification)
router.post('/webhook/mifos', apiController.handleMifosWebhook);

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



