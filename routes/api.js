// routes/api.js - Main API routes
const express = require('express');
const multer = require('multer');
const UserController = require('../controllers/userController');
const CertificateController = require('../controllers/certificateController');
const { authenticateToken, requireAdmin, requireApprovedUser, rateLimit } = require('../middleware/auth');

const router = express.Router();

// Multer configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname)
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Accept only Excel files
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
        file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Apply rate limiting to all API routes
router.use(rateLimit(15 * 60 * 1000, 1000)); // 1000 requests per 15 minutes

// User Routes
router.get('/user/profile', authenticateToken, requireApprovedUser, async (req, res) => {
  try {
    const user = await knex('users')
      .select('id', 'username', 'email', 'role', 'status', 'created_at')
      .where('id', req.user.userId)
      .first();
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/user/profile', authenticateToken, requireApprovedUser, UserController.updateProfile);
router.post('/user/change-password', authenticateToken, requireApprovedUser, UserController.changePassword);
router.get('/user/dashboard-stats', authenticateToken, requireApprovedUser, CertificateController.getDashboardStats);


router.get('/eo-certificates/dropdowns/years', authenticateToken, requireApprovedUser, CertificateController.getDropdownYears);
router.get('/eo-certificates/dropdowns/vehicle-makes', authenticateToken, requireApprovedUser, CertificateController.getDropdownVehicleMakes);
router.get('/eo-certificates/dropdowns/vehicle-models', authenticateToken, requireApprovedUser, CertificateController.getDropdownVehicleModels);
router.get('/eo-certificates/dropdowns/eo-numbers', authenticateToken, requireApprovedUser, CertificateController.getDropdownEONumbers);

// EO Certificate Routes (for approved users)
router.get('/eo-certificates', authenticateToken, requireApprovedUser, CertificateController.getCertificates);
router.get('/eo-certificates/:id', authenticateToken, requireApprovedUser, CertificateController.getCertificate);
router.post('/eo-certificates/search', authenticateToken, requireApprovedUser, CertificateController.getCertificates);
router.get('/eo-number/:eo_number', authenticateToken, requireApprovedUser, CertificateController.searchByEONumber);

// Filter options
router.get('/filter-options', authenticateToken, requireApprovedUser, CertificateController.getFilterOptions);

// Admin Routes - User Management
router.get('/admin/users', authenticateToken, requireAdmin, UserController.getAllUsers);
router.put('/admin/users/:id/status', authenticateToken, requireAdmin, UserController.updateUserStatus);
router.delete('/admin/users/:id', authenticateToken, requireAdmin, UserController.deleteUser);
router.post('/admin/users/bulk-update', authenticateToken, requireAdmin, UserController.bulkUpdateUsers);

// Admin Routes - Certificate Management
router.get('/admin/eo-certificates', authenticateToken, requireAdmin, CertificateController.getCertificates);
router.post('/admin/eo-certificates', authenticateToken, requireAdmin, CertificateController.createCertificate);
router.put('/admin/eo-certificates/:id', authenticateToken, requireAdmin, CertificateController.updateCertificate);
router.delete('/admin/eo-certificates/:id', authenticateToken, requireAdmin, CertificateController.deleteCertificate);
router.post('/admin/eo-certificates/bulk-delete', authenticateToken, requireAdmin, CertificateController.bulkDeleteCertificates);

// Admin Routes - File Operations
router.post('/admin/upload-excel', 
  authenticateToken, 
  requireAdmin, 
  upload.single('excel'), 
  CertificateController.uploadExcel
);

router.get('/admin/export-certificates', authenticateToken, requireAdmin, CertificateController.exportCertificates);

// Admin Routes - Dashboard and Analytics
router.get('/admin/dashboard-stats', authenticateToken, requireAdmin, CertificateController.getDashboardStats);
router.get('/admin/analytics', authenticateToken, requireAdmin, CertificateController.getCertificateAnalytics);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File too large. Maximum size is 10MB.' });
    }
  }
  if (error.message === 'Only Excel files are allowed') {
    return res.status(400).json({ message: 'Only Excel files (.xlsx, .xls) are allowed.' });
  }
  next(error);
});

module.exports = router;