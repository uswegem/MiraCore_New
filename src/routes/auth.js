const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const { authMiddleware, roleMiddleware } = require('../middleware/authMiddleware');
const apiController = require('../controllers/apiController');

// Public routes
router.post('/login', AuthController.login);

// Protected routes
router.post('/product-create', authMiddleware, apiController.processRequest);
router.get('/profile', authMiddleware, AuthController.getProfile);
router.post('/change-password', authMiddleware, AuthController.changePassword);
router.post('/logout', authMiddleware, AuthController.logout);

module.exports = router;