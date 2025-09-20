// server.js - Updated main server file with organized routes
const express = require('express');
const cors = require('cors');
const path = require('path');
const knex = require('./config/database');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000', 
    'http://127.0.0.1:3000', 
    'http://localhost:5000', 
    'http://127.0.0.1:5000',
    'https://eocertificates.netlify.app',  // Add your actual GitHub Pages URL
    process.env.FRONTEND_URL
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Content-Length', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from the public directory
// app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Create uploads directory if it doesn't exist
const fs = require('fs');
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
}

// API Routes (consolidated to avoid duplicates)
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

// Serve index.html for client-side routing (must be after API routes)
// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname, 'public', 'index.html'));
// });

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'EO Certificate Management API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      auth: '/api/auth',
      certificates: '/api/eo-certificates',
      admin: '/api/admin',
      user: '/api/user'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Endpoint not found' });
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  // Don't crash the process in production
  if (process.env.NODE_ENV === 'development') {
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Don't crash the process in production
  if (process.env.NODE_ENV === 'development') {
    process.exit(1);
  }
});

// Create default admin user
async function createDefaultAdmin() {
  try {
    const adminExists = await knex('users').where('role', 'admin').first();
    
    if (!adminExists) {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('admin123', 12);
      
      await knex('users').insert({
        username: 'admin',
        email: 'admin@example.com',
        password: hashedPassword,
        role: 'admin',
        status: 'approved',
        created_at: knex.fn.now(),
        updated_at: knex.fn.now()
      });
      
      console.log('✅ Default admin user created:');
      console.log('   Email: admin@example.com');
      console.log('   Password: admin123');
      console.log('   Please change this password after first login!');
    }
  } catch (error) {
    console.error('❌ Error creating default admin:', error.message);
  }
}

// Initialize database and start server
async function startServer() {
  try {
    // Test database connection
    await knex.raw('SELECT 1');
    console.log('✅ Database connected successfully');
    
    // Run migrations
    await knex.migrate.latest();
    console.log('✅ Database migrations completed');
    
    // Create default admin
    await createDefaultAdmin();
    
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log('🚀 Server running on port', PORT);
      console.log('📊 EO Certificate Management API is ready!');
      console.log(`🌐 API Base URL: http://localhost:${PORT}`);
      console.log(`📖 API Documentation: http://localhost:${PORT}/`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  await knex.destroy();
  console.log('✅ Database connections closed');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down server...');
  await knex.destroy();
  console.log('✅ Database connections closed');
  process.exit(0);
});

startServer();
