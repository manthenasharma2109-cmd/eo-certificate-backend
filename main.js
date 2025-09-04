// server.js - Main Express server with PostgreSQL and Knex.js
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const knex = require('./config/database');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname)
  }
});

const upload = multer({ storage: storage });

// JWT middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Admin middleware
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

// Approved user middleware
const requireApprovedUser = (req, res, next) => {
  if (req.user.status !== 'approved') {
    return res.status(403).json({ message: 'Account not approved' });
  }
  next();
};

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check if user already exists
    const existingUser = await knex('users')
      .where('email', email)
      .orWhere('username', username)
      .first();

    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

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
      message: 'User registered successfully. Please wait for admin approval.',
      userId: userId
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await knex('users').where('email', email).first();
    
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check if user is approved (except for admin)
    if (user.role !== 'admin' && user.status !== 'approved') {
      return res.status(403).json({ 
        message: user.status === 'pending' ? 'Account pending approval' : 'Account denied'
      });
    }

    // Create JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        role: user.role, 
        status: user.status 
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
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

// User Routes
app.get('/api/user/profile', authenticateToken, requireApprovedUser, async (req, res) => {
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

// EO Certificate Routes for Users
app.get('/api/eo-certificates', authenticateToken, requireApprovedUser, async (req, res) => {
  try {
    const { 
      year, 
      make, 
      model, 
      manufacturer, 
      test_group, 
      engine_size,
      evaporative_family,
      exhaust_ecs_special_features,
      page = 1, 
      limit = 10 
    } = req.query;
    
    let query = knex('eo_certificates');

    // Apply filters
    if (year) query = query.where('year', parseInt(year));
    if (make) query = query.whereILike('make', `%${make}%`);
    if (model) query = query.whereILike('model', `%${model}%`);
    if (manufacturer) query = query.whereILike('manufacturer', `%${manufacturer}%`);
    if (test_group) query = query.whereILike('test_group', `%${test_group}%`);
    if (engine_size) query = query.whereILike('engine_size', `%${engine_size}%`);
    if (evaporative_family) query = query.whereILike('evaporative_family', `%${evaporative_family}%`);
    if (exhaust_ecs_special_features) query = query.whereILike('exhaust_ecs_special_features', `%${exhaust_ecs_special_features}%`);

    // Get total count for pagination
    const totalQuery = query.clone();
    const [{ count }] = await totalQuery.count('* as count');
    const total = parseInt(count);

    // Get paginated results
    const certificates = await query
      .orderBy('created_at', 'desc')
      .limit(parseInt(limit))
      .offset((parseInt(page) - 1) * parseInt(limit));

    res.json({
      certificates,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/eo-certificates/:id', authenticateToken, requireApprovedUser, async (req, res) => {
  try {
    const certificate = await knex('eo_certificates')
      .where('id', req.params.id)
      .first();
    
    if (!certificate) {
      return res.status(404).json({ message: 'Certificate not found' });
    }
    
    res.json(certificate);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Admin Routes
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await knex('users')
      .select('id', 'username', 'email', 'role', 'status', 'created_at', 'updated_at')
      .orderBy('created_at', 'desc');
    
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.put('/api/admin/users/:id/approve', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body; // 'approved' or 'denied'
    
    const [user] = await knex('users')
      .where('id', req.params.id)
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
});

// Admin EO Certificate Management
app.get('/api/admin/eo-certificates', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { 
      eo_number,
      year, 
      make, 
      model, 
      manufacturer, 
      test_group, 
      engine_size,
      evaporative_family,
      exhaust_ecs_special_features,
      page = 1, 
      limit = 10 
    } = req.query;
    
    let query = knex('eo_certificates');

    // ✅ Apply filters dynamically
    if (eo_number) query = query.whereILike('EO Number', `%${eo_number}%`);
    if (year) query = query.where('year', parseInt(year));
    if (make) query = query.whereILike('Vehicle Make', `%${make}%`);
    if (model) query = query.whereILike('Vehicle Model', `%${model}%`);
    if (manufacturer) query = query.whereILike('Manufacturer', `%${manufacturer}%`);
    if (test_group) query = query.whereILike('Test Group', `%${test_group}%`);
    if (engine_size) query = query.whereILike('Engine Size(L)', `%${engine_size}%`);
    if (evaporative_family) query = query.whereILike('Evaporative Family', `%${evaporative_family}%`);
    if (exhaust_ecs_special_features) query = query.whereILike('Exhaust Emission Control System (ECS) Special Features', `%${exhaust_ecs_special_features}%`);

    // ✅ Count total before applying pagination
    const totalQuery = query.clone();
    const [{ count }] = await totalQuery.count('* as count');
    const total = parseInt(count);

    // ✅ Paginated results
    const certificates = await query
      .orderBy('created_at', 'desc')
      .limit(parseInt(limit))
      .offset((parseInt(page) - 1) * parseInt(limit));

    res.json({
      certificates,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        total
      }
    });
  } catch (error) {
    console.error("Error fetching EO certificates:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});


app.post('/api/admin/eo-certificates', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const certificateData = {
      eo_number: req.body.eo_number,
      year: parseInt(req.body.year),
      model: req.body.model,
      make: req.body.make,
      manufacturer: req.body.manufacturer,
      test_group: req.body.test_group,
      engine_size: req.body.engine_size,
      evaporative_family: req.body.evaporative_family,
      exhaust_ecs_special_features: req.body.exhaust_ecs_special_features,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    };

    const [certificate] = await knex('eo_certificates')
      .insert(certificateData)
      .returning('*');

    res.status(201).json({ 
      message: 'Certificate created successfully', 
      certificate 
    });
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      res.status(400).json({ message: 'EO number already exists' });
    } else {
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
});

app.put('/api/admin/eo-certificates/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const updateData = {
      eo_number: req.body.eo_number,
      year: parseInt(req.body.year),
      model: req.body.model,
      make: req.body.make,
      manufacturer: req.body.manufacturer,
      test_group: req.body.test_group,
      engine_size: req.body.engine_size,
      evaporative_family: req.body.evaporative_family,
      exhaust_ecs_special_features: req.body.exhaust_ecs_special_features,
      updated_at: knex.fn.now()
    };

    const [certificate] = await knex('eo_certificates')
      .where('id', req.params.id)
      .update(updateData)
      .returning('*');

    if (!certificate) {
      return res.status(404).json({ message: 'Certificate not found' });
    }

    res.json({ message: 'Certificate updated successfully', certificate });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.delete('/api/admin/eo-certificates/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const deletedCount = await knex('eo_certificates')
      .where('id', req.params.id)
      .del();

    if (deletedCount === 0) {
      return res.status(404).json({ message: 'Certificate not found' });
    }

    res.json({ message: 'Certificate deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Excel Upload Route - Updated for new data structure
app.post('/api/admin/upload-excel', authenticateToken, requireAdmin, upload.single('excel'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(worksheet);

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // Use transaction for bulk insert
    await knex.transaction(async (trx) => {
      for (const [index, row] of jsonData.entries()) {
        try {
          const certificateData = {
            eo_number: row.EO_number || row.eo_number || row['EO Number'],
            year: parseInt(row.year || row.Year),
            model: row.model || row.Model,
            make: row.make || row.Make,
            manufacturer: row.manufacturer || row.Manufacturer,
            test_group: row.test_group || row['test group'] || row['Test Group'],
            engine_size: row.engine_size || row['engine size'] || row['Engine Size'],
            evaporative_family: row.evaporative_family || row['evaporative family'] || row['Evaporative Family'],
            exhaust_ecs_special_features: row.exhaust_ecs_special_features || row['exhaust ECS special features'] || row['Exhaust ECS Special Features'],
            created_at: knex.fn.now(),
            updated_at: knex.fn.now()
          };

          // Validate required fields
          if (!certificateData.eo_number || !certificateData.year || !certificateData.make || !certificateData.model) {
            throw new Error('Missing required fields: EO_number, year, make, or model');
          }

          await trx('eo_certificates').insert(certificateData);
          successCount++;
        } catch (error) {
          errorCount++;
          errors.push({ 
            row: index + 1, 
            data: row, 
            error: error.message 
          });
        }
      }
    });

    res.json({
      message: `Upload completed. ${successCount} certificates added, ${errorCount} errors.`,
      successCount,
      errorCount,
      errors: errors.slice(0, 10)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get filter options - Updated for new fields
app.get('/api/filter-options', authenticateToken, requireApprovedUser, async (req, res) => {
  try {
    const years = await knex('eo_certificates').distinct('year').orderBy('year', 'desc');
    const makes = await knex('eo_certificates').distinct('make').orderBy('make');
    const models = await knex('eo_certificates').distinct('model').orderBy('model');
    const manufacturers = await knex('eo_certificates').distinct('manufacturer').orderBy('manufacturer');
    const testGroups = await knex('eo_certificates').distinct('test_group').orderBy('test_group');
    const engineSizes = await knex('eo_certificates').distinct('engine_size').orderBy('engine_size');
    const evaporativeFamilies = await knex('eo_certificates').distinct('evaporative_family').orderBy('evaporative_family');

    res.json({
      years: years.map(y => y.year).filter(y => y),
      makes: makes.map(m => m.make).filter(m => m),
      models: models.map(m => m.model).filter(m => m),
      manufacturers: manufacturers.map(m => m.manufacturer).filter(m => m),
      testGroups: testGroups.map(t => t.test_group).filter(t => t),
      engineSizes: engineSizes.map(e => e.engine_size).filter(e => e),
      evaporativeFamilies: evaporativeFamilies.map(e => e.evaporative_family).filter(e => e)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Advanced search endpoint
app.post('/api/eo-certificates/search', authenticateToken, requireApprovedUser, async (req, res) => {
  try {
    const { 
      filters = {}, 
      search = '', 
      page = 1, 
      limit = 10,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = req.body;

    let query = knex('eo_certificates');

    // Apply individual filters
    Object.keys(filters).forEach(key => {
      if (filters[key] && filters[key] !== '') {
        if (key === 'year') {
          query = query.where(key, parseInt(filters[key]));
        } else {
          query = query.whereILike(key, `%${filters[key]}%`);
        }
      }
    });

    // Apply global search across multiple fields
    if (search) {
      query = query.where(function() {
        this.whereILike('EO Number', `%${search}%`)
          .orWhereILike('Vehicle Make', `%${search}%`)
          .orWhereILike('Vehicle Model', `%${search}%`)
          .orWhereILike('Manufacturer', `%${search}%`)
          .orWhereILike('Test Group', `%${search}%`)
          .orWhereILike('Engine Size(L)', `%${search}%`)
          .orWhereILike('Evaporative Family', `%${search}%`)
          .orWhereILike('Exhaust Emission Control System (ECS)', `%${search}%`);
      });
    }

    // Get total count
    const totalQuery = query.clone();
    const [{ count }] = await totalQuery.count('* as count');
    const total = parseInt(count);

    // Apply sorting and pagination
    const certificates = await query
      .orderBy(sortBy, sortOrder)
      .limit(parseInt(limit))
      .offset((parseInt(page) - 1) * parseInt(limit));

    res.json({
      certificates,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Dashboard stats for admin
app.get('/api/admin/dashboard-stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const totalUsers = await knex('users').count('* as count').first();
    const pendingUsers = await knex('users').where('status', 'pending').count('* as count').first();
    const approvedUsers = await knex('users').where('status', 'approved').count('* as count').first();
    const totalCertificates = await knex('eo_certificates').count('* as count').first();

    // Certificates by year
    const certificatesByYear = await knex('eo_certificates')
      .select('Year')
      .count('* as count')
      .groupBy('Year')
      .orderBy('Year', 'desc');

    // Top manufacturers
    const topManufacturers = await knex('eo_certificates')
      .select('Manufacturer')
      .count('* as count')
      .groupBy('Manufacturer')
      .orderBy('count', 'desc')
      .limit(10);

    // Recent users
    const recentUsers = await knex('users')
      .select('id', 'username', 'email', 'status', 'created_at')
      .orderBy('created_at', 'desc')
      .limit(5);

    res.json({
      stats: {
        totalUsers: parseInt(totalUsers.count),
        pendingUsers: parseInt(pendingUsers.count),
        approvedUsers: parseInt(approvedUsers.count),
        totalCertificates: parseInt(totalCertificates.count)
      },
      charts: {
        certificatesByYear,
        topManufacturers
      },
      recentActivity: {
        recentUsers
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Dashboard stats for users
app.get('/api/eo-certificates/stats', authenticateToken, requireApprovedUser, async (req, res) => {
  try {
    // ✅ Total certificates
    const totalCertificates = await knex('eo_certificates')
      .count('* as count')
      .first();

    // ✅ Certificates by Year
    const certificatesByYear = await knex('eo_certificates')
      .select('Year as year')
      .count('* as count')
      .groupBy('Year')
      .orderBy('Year', 'desc');

    // ✅ Top Vehicle Makes
    const topMakes = await knex('eo_certificates')
      .select('Vehicle Make as make')
      .count('* as count')
      .groupBy('Vehicle Make')
      .orderBy('count', 'desc')
      .limit(10);

    // ✅ Top Manufacturers
    const topManufacturers = await knex('eo_certificates')
      .select('Manufacturer as manufacturer')
      .count('* as count')
      .groupBy('Manufacturer')
      .orderBy('count', 'desc')
      .limit(10);

    res.json({
      stats: {
        totalCertificates: parseInt(totalCertificates.count, 10) || 0
      },
      charts: {
        certificatesByYear,
        topMakes,
        topManufacturers
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});




// Export certificates to Excel format
app.get('/api/admin/export-certificates', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const certificates = await knex('eo_certificates')
      .orderBy('year', 'desc')
      .orderBy('make')
      .orderBy('model');
    
    const exportData = certificates.map(cert => ({
      'EO Number': cert.eo_number,
      'Year': cert.year,
      'Model': cert.model,
      'Make': cert.make,
      'Manufacturer': cert.manufacturer,
      'Test Group': cert.test_group,
      'Engine Size': cert.engine_size,
      'Evaporative Family': cert.evaporative_family,
      'Exhaust ECS Special Features': cert.exhaust_ecs_special_features,
      'Created At': cert.created_at
    }));

    res.json({
      message: 'Export data prepared',
      data: exportData,
      count: exportData.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Bulk operations for admin
app.post('/api/admin/bulk-delete-certificates', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { certificateIds } = req.body;
    
    const deletedCount = await knex('eo_certificates')
      .whereIn('id', certificateIds)
      .del();

    res.json({
      message: `${deletedCount} certificates deleted`,
      deletedCount
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create default admin user on startup
async function createDefaultAdmin() {
  try {
    const adminExists = await knex('users').where('role', 'admin').first();
    
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await knex('users').insert({
        username: 'admin',
        email: 'admin@example.com',
        password: hashedPassword,
        role: 'admin',
        status: 'approved',
        created_at: knex.fn.now(),
        updated_at: knex.fn.now()
      });
      console.log('Default admin user created: admin@example.com / admin123');
    }
  } catch (error) {
    console.error('Error creating default admin:', error);
  }
}

// Initialize database and start server
async function startServer() {
  try {
    // Run migrations
    await knex.migrate.latest();
    console.log('Database migrations completed');
    
    // Create default admin
    await createDefaultAdmin();
    
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();



app.get('/api/eo-certificates/dropdowns/years', authenticateToken, requireApprovedUser, async (req, res) => {
  try {
    const years = await knex('eo_certificates')
      .distinct('Year')
      .orderBy('Year', 'desc');

    res.json(years.map(y => y.year));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});


app.get('/api/eo-certificates/dropdowns/vehicle-makes', authenticateToken, requireApprovedUser, async (req, res) => {
  try {
    const { year } = req.query;
    const makes = await knex('eo_certificates')
      .distinct('vehicle_make')
      .where('year', year)
      .orderBy('vehicle_make');

    res.json(makes.map(m => m.vehicle_make));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});


app.get('/api/eo-certificates/dropdowns/vehicle-models', authenticateToken, requireApprovedUser, async (req, res) => {
  try {
    const { year, make } = req.query;
    const models = await knex('eo_certificates')
      .distinct('vehicle_model')
      .where({ year, vehicle_make: make })
      .orderBy('vehicle_model');

    res.json(models.map(m => m.vehicle_model));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/eo-certificates/dropdowns/eo-numbers', authenticateToken, requireApprovedUser, async (req, res) => {
  try {
    const { year, make, model } = req.query;
    const eos = await knex('eo_certificates')
      .distinct('eo_number')
      .where({ year, vehicle_make: make, vehicle_model: model })
      .orderBy('eo_number');

    res.json(eos.map(e => e.eo_number));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/eo-certificates/:id', authenticateToken, requireApprovedUser, async (req, res) => {
  try {
    const certificate = await knex('eo_certificates')
      .where('id', req.params.id)
      .first();
    
    if (!certificate) {
      return res.status(404).json({ message: 'Certificate not found' });
    }
    
    res.json(certificate);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});



