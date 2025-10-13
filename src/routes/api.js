const express = require('express');
const router = express.Router();
const apiController = require('../controllers/apiController');


// Single endpoint for all frontend requests
router.post('/loan', apiController.processRequest);

module.exports = router;



