const express = require('express');
const router = express.Router();
const apiController = require('../controllers/apiController');


// Single endpoint for all frontend requests
router.post('/loan', apiController.processRequest);

// Webhook endpoint for MIFOS notifications
router.post('/webhook/mifos', apiController.handleMifosWebhook);

module.exports = router;



