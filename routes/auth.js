// routes/auth.js - Authentication routes
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const knex = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    // Check if user already exists
    const existingUser = await knex('users')
      .where('email', email)
      .orWhere('username', username)
      .first();

    if (existingUser) {
      return res.status(400).json({ 
        message: existingUser.email === email ? 'Email already exists' : 'Username already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const [userId] = await knex('users').insert({
      username,
      email,
      password: hashedPassword,
      role: 'user',
      status: 'pending',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    }).returning('id');

    res.status(201).json({ 
      message: 'Registration successful! Please wait for admin approval to access your account.',
      userId: userId
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find user
    const user = await knex('users').where('email', email).first();
    
    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Check user status
    if (user.role !== 'admin' && user.status === 'pending') {
      return res.status(403).json({ 
        message: 'Your account is pending admin approval. Please wait for approval.'
      });
    }

    if (user.status === 'denied') {
      return res.status(403).json({ 
        message: 'Your account has been denied. Please contact the administrator.'
      });
    }

    // Create JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        role: user.role, 
        status: user.status,
        username: user.username
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Verify token and get user info
router.get('/verify', authenticateToken, async (req, res) => {
  try {
    const user = await knex('users')
      .select('id', 'username', 'email', 'role', 'status', 'created_at')
      .where('id', req.user.userId)
      .first();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      valid: true,
      user
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Refresh token
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    const user = await knex('users')
      .select('id', 'username', 'email', 'role', 'status')
      .where('id', req.user.userId)
      .first();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Create new token
    const newToken = jwt.sign(
      { 
        userId: user.id, 
        role: user.role, 
        status: user.status,
        username: user.username
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      token: newToken,
      user
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Logout (client-side token removal, but we can log it)
router.post('/logout', authenticateToken, (req, res) => {
  // In a more advanced setup, you might want to blacklist the token
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;