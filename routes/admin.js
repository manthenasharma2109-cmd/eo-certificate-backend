// routes/admin.js - Admin routes
const express = require('express');
const router = express.Router();
const knex = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const UserController = require('../controllers/userController');

// Get all users (admin only)
router.get('/users', requireAdmin, UserController.getAllUsers);

// Update user status (approve/deny/suspend)
router.put('/users/:id/status', requireAdmin, UserController.updateUserStatus);


// Delete user
router.delete('/users/:id', requireAdmin, UserController.deleteUser);

module.exports = router;
