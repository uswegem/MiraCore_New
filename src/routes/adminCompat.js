
// Admin-specific routes for MiraAdmin frontend compatibility
const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const UserController = require('../controllers/userController');
const AuditController = require('../controllers/auditController');
const LoanMappingService = require('../services/loanMappingService');
const { authMiddleware, roleMiddleware } = require('../middleware/authMiddleware');

// Authentication routes
router.post('/auth/login', AuthController.login);
router.get('/auth/profile', authMiddleware, AuthController.getProfile);
router.post('/auth/logout', authMiddleware, AuthController.logout);

// Product/Loan routes
router.get('/loan/list-products', authMiddleware, async (req, res) => {
    try {
        // Return loan products from CBS or mock data
        res.json({
            success: true,
            data: {
                products: [
                    { id: 1, name: 'Personal Loan', rate: 12.5, maxAmount: 1000000 },
                    { id: 2, name: 'Business Loan', rate: 15.0, maxAmount: 5000000 }
                ]
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/loan/list-employee-loan', authMiddleware, async (req, res) => {
    try {
        const loans = await LoanMappingService.getAllWithDetails();
        res.json({
            success: true,
            data: { loans }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Admin user management (compatible with existing routes)
router.get('/admin/get_all_users', authMiddleware, roleMiddleware(['super_admin', 'admin']), UserController.getUsers);
router.get('/admin/get_user_details/:id', authMiddleware, roleMiddleware(['super_admin', 'admin']), UserController.getUserById);
router.delete('/admin/delete_user/:id', authMiddleware, roleMiddleware(['super_admin', 'admin']), UserController.deleteUser);

// Create user endpoint (for MiraAdmin frontend)
router.post('/admin/create_user', authMiddleware, roleMiddleware(['super_admin', 'admin']), UserController.createUser);

// Update user endpoint
router.put('/admin/update_user/:id', authMiddleware, roleMiddleware(['super_admin', 'admin']), UserController.updateUser);

// Admin profile routes
router.get('/admin/get_admin', authMiddleware, AuthController.getProfile);
router.put('/admin/edit_admin', authMiddleware, UserController.updateUser);
router.post('/admin/change_password', authMiddleware, AuthController.changePassword);

// Notification routes (for MiraAdmin frontend)
router.get('/notification/list', authMiddleware, async (req, res) => {
    try {
        // Return notifications from database or empty list
        const Notification = require('../models/Notification');
        let notifications = [];
        
        try {
            notifications = await Notification.find()
                .sort({ createdAt: -1 })
                .limit(50)
                .lean();
        } catch (e) {
            // Model may not exist yet, return empty list
            notifications = [];
        }
        
        res.json({
            success: true,
            data: { notifications }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Mark notification as read
router.put('/notification/read/:id', authMiddleware, async (req, res) => {
    try {
        const Notification = require('../models/Notification');
        await Notification.findByIdAndUpdate(req.params.id, { read: true });
        res.json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Pending responses routes (for message tracking)
router.get('/messages/pending-responses', authMiddleware, async (req, res) => {
    try {
        const MessageLog = require('../models/MessageLog');
        let pendingResponses = [];
        
        try {
            pendingResponses = await MessageLog.find({
                status: { $in: ['PENDING', 'AWAITING_RESPONSE'] }
            })
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();
        } catch (e) {
            // Model may not exist, return empty list
            pendingResponses = [];
        }
        
        res.json({
            success: true,
            data: { pendingResponses }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
