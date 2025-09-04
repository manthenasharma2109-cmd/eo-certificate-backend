// middleware/auth.js - Authentication and authorization middleware
const jwt = require('jsonwebtoken');
const knex = require('../config/database');

// JWT authentication middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Access token required' });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

    // Verify user exists in database
    const user = await knex('users')
      .select('id', 'username', 'email', 'role', 'status')
      .where('id', decoded.userId)
      .first();

    if (!user) {
      return res.status(403).json({ message: 'User not found' });
    }

    if (user.status === 'pending') {
      return res.status(403).json({ message: 'Account pending admin approval' });
    }

    if (user.status === 'denied' || user.status === 'suspended') {
      return res.status(403).json({ message: 'Account is not active' });
    }

    // Attach user to request object
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ message: 'Invalid token' });
    }
    console.error('Authentication error:', error);
    res.status(500).json({ message: 'Authentication failed', error: error.message });
  }
};

// Admin role middleware
const requireAdmin = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    // Double-check user still exists and is admin
    const user = await knex('users')
      .select('role', 'status')
      .where('id', req.user.id)
      .first();

    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Approved user middleware
const requireApprovedUser = async (req, res, next) => {
  try {
    if (!req.user || (!req.user.id && !req.user.userId)) {
      return res.status(401).json({ message: 'User authentication failed' });
    }

    const userId = req.user.id || req.user.userId;

    // Admins are always approved
    if (req.user.role === 'admin') {
      return next();
    }

    if (req.user.status !== 'approved') {
      return res.status(403).json({ 
        message: req.user.status === 'pending' 
          ? 'Your account is pending approval' 
          : 'Your account has been denied access'
      });
    }

    // Double-check user status in database
    const user = await knex('users')
      .select('status')
      .where('id', userId)
      .first();

    if (!user || user.status !== 'approved') {
      return res.status(403).json({ message: 'Account not approved' });
    }

    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};


// Optional authentication (for public endpoints that can benefit from user context)
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      req.user = null;
    } else {
      req.user = user;
    }
    next();
  });
};

// Rate limiting middleware (basic implementation)
const rateLimitMap = new Map();

const rateLimit = (windowMs = 15 * 60 * 1000, maxRequests = 100) => {
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    
    if (!rateLimitMap.has(key)) {
      rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    const userData = rateLimitMap.get(key);
    
    if (now > userData.resetTime) {
      userData.count = 1;
      userData.resetTime = now + windowMs;
      return next();
    }
    
    if (userData.count >= maxRequests) {
      return res.status(429).json({ 
        message: 'Too many requests. Please try again later.',
        resetTime: userData.resetTime 
      });
    }
    
    userData.count++;
    next();
  };
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requireApprovedUser,
  optionalAuth,
  rateLimit
};