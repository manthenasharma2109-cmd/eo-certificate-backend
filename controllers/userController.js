// controllers/userController.js - User management operations
const knex = require('../config/database');
const bcrypt = require('bcryptjs');

class UserController {
  // Get all users (Admin only)
static async getAllUsers(req, res) {
  try {
    const { page = 1, limit = 10, status, search } = req.query;

    // Build base query for filters only (no select yet)
    let baseQuery = knex('users');

    if (status && status !== 'all') {
      baseQuery = baseQuery.where('status', status);
    }

    if (search) {
      baseQuery = baseQuery.where(function () {
        this.whereILike('username', `%${search}%`)
          .orWhereILike('email', `%${search}%`);
      });
    }

    // Get total count separately (safe in Postgres)
    const [{ count }] = await baseQuery.clone().count('* as count');
    const total = parseInt(count);

    // Get paginated results with selected columns
    const users = await baseQuery
      .clone()
      .select('id', 'username', 'email', 'role', 'status', 'created_at', 'updated_at')
      .orderBy('created_at', 'desc')
      .limit(parseInt(limit))
      .offset((parseInt(page) - 1) * parseInt(limit));

    res.json({
      users,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        total,
        hasNext: parseInt(page) < Math.ceil(total / limit),
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}


  // Update user status
  static async updateUserStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['approved', 'denied', 'pending'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }

      const [user] = await knex('users')
        .where('id', id)
        .update({ 
          status, 
          updated_at: knex.fn.now() 
        })
        .returning(['id', 'username', 'email', 'role', 'status']);

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json({ message: `User ${status}`, user });
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }

  // Update user profile
  static async updateProfile(req, res) {
    try {
      const { username, email } = req.body;
      const userId = req.user.userId;

      // Check if username or email already exists for other users
      const existingUser = await knex('users')
        .where(function() {
          this.where('username', username).orWhere('email', email);
        })
        .andWhere('id', '!=', userId)
        .first();

      if (existingUser) {
        return res.status(400).json({ message: 'Username or email already exists' });
      }

      const [user] = await knex('users')
        .where('id', userId)
        .update({
          username,
          email,
          updated_at: knex.fn.now()
        })
        .returning(['id', 'username', 'email', 'role', 'status']);

      res.json({ message: 'Profile updated successfully', user });
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }

  // Change password
  static async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.userId;

      // Get current user
      const user = await knex('users').where('id', userId).first();
      
      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(400).json({ message: 'Current password is incorrect' });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update password
      await knex('users')
        .where('id', userId)
        .update({
          password: hashedPassword,
          updated_at: knex.fn.now()
        });

      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }

  // Delete user (Admin only)
  static async deleteUser(req, res) {
    try {
      const { id } = req.params;

      // Prevent admin from deleting themselves
      if (parseInt(id) === req.user.userId) {
        return res.status(400).json({ message: 'Cannot delete your own account' });
      }

      const deletedCount = await knex('users').where('id', id).del();

      if (deletedCount === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }

  // Bulk approve/deny users
  static async bulkUpdateUsers(req, res) {
    try {
      const { userIds, status } = req.body;

      if (!['approved', 'denied'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }

      const updatedCount = await knex('users')
        .whereIn('id', userIds)
        .update({
          status,
          updated_at: knex.fn.now()
        });

      res.json({
        message: `${updatedCount} users ${status}`,
        updatedCount
      });
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
}

module.exports = UserController;