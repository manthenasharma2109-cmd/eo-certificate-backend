// controllers/certificateController.js - EO Certificate management operations
const knex = require('../config/database');
const xlsx = require('xlsx');

// Whitelist of sortable/filterable columns (exact DB names)
const COL = {
  EO_NUMBER: '"EO Number"',
  VEHICLE_MAKE: '"Vehicle Make"',
  VEHICLE_MODEL: '"Vehicle Model"',
  EVAPORATIVE_FAMILY: '"Evaporative Family"',
  VEHICLE_CLASS: '"Vehicle Class"',
  YEAR: '"Year"',
  MANUFACTURER: '"Manufacturer"',
  TEST_GROUP: '"Test Group"',
  ENGINE_SIZE_L: '"Engine Size(L)"',
  EXHAUST_ECS: '"Exhaust Emission Control System (ECS)"'
};

// For safe sorting: accept only these exact strings from query
const SORTABLE_COLUMNS = new Set([
  'EO Number',
  'Vehicle Make',
  'Vehicle Model',
  'Evaporative Family',
  'Vehicle Class',
  'Year',
  'Manufacturer',
  'Test Group',
  'Engine Size(L)',
  'Exhaust Emission Control System (ECS)',
  'created_at',
  'updated_at',
  'id'
]);

class CertificateController {
  // ===========================
  // Get all certificates with filters + pagination + sorting
  // (returns exact DB column names in JSON)
  // ===========================
  static async getDropdownYears(req, res) {
    try {
      const years = await knex('eo_certificates')
        .distinct('Year')
        .orderBy('Year', 'desc');
      res.json(years.map(y => y.Year));
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async getDropdownVehicleMakes(req, res) {
    try {
      const { year } = req.query;
      const makes = await knex('eo_certificates')
        .distinct('Vehicle Make')
        .where('Year', year)
        .orderBy('Vehicle Make');
      res.json(makes.map(m => m['Vehicle Make']));
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async getDropdownVehicleModels(req, res) {
    try {
      const { year, make } = req.query;
      const models = await knex('eo_certificates')
        .distinct('Vehicle Model')
        .where('Year', year)
        .andWhere('Vehicle Make', make)
        .orderBy('Vehicle Model');
      res.json(models.map(m => m['Vehicle Model']));
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async getDropdownEONumbers(req, res) {
    try {
      const { year, make, model } = req.query;
      const eos = await knex('eo_certificates')
        .distinct('EO Number')
        .where('Year', year)
        .andWhere('Vehicle Make', make)
        .andWhere('Vehicle Model', model)
        .orderBy('EO Number');
      res.json(eos.map(e => e['EO Number']));
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }       
  }
  static async getCertificates(req, res) {
    try {
      const {
        year,
        make,
        model,
        eo_number,
        page = 1,
        limit = 20,
        sortBy = 'Year', // default
        sortOrder = 'desc'
      } = req.query;

      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const limitNum = Math.max(parseInt(limit, 10) || 20, 1);

      let query = knex('eo_certificates');

      // ---- Filters (use whereRaw for columns with spaces) ----
      if (year) {
        const y = parseInt(year, 10);
        if (!Number.isNaN(y)) query = query.whereRaw(`${COL.YEAR} = ?`, [y]);
      }
      if (make) query = query.whereRaw(`${COL.VEHICLE_MAKE} ILIKE ?`, [`%${make}%`]);
      if (model) query = query.whereRaw(`${COL.VEHICLE_MODEL} ILIKE ?`, [`%${model}%`]);
      if (eo_number) query = query.whereRaw(`${COL.EO_NUMBER} ILIKE ?`, [`%${eo_number}%`]);

      // ---- Count for pagination ----
      const [{ count }] = await query.clone().count('* as count');
      const total = parseInt(count, 10) || 0;

      // ---- Sorting (whitelist to avoid SQL injection) ----
      const normalizedSort = SORTABLE_COLUMNS.has(sortBy) ? sortBy : 'Year';
      const direction = (String(sortOrder).toLowerCase() === 'asc') ? 'asc' : 'desc';

      // Build orderByRaw safely
      let orderExpr;
      // sort by DB columns with spaces -> quote; simple snake columns -> plain
      if (normalizedSort === 'created_at' || normalizedSort === 'updated_at' || normalizedSort === 'id') {
        orderExpr = `${normalizedSort} ${direction}`;
      } else {
        orderExpr = `"${normalizedSort}" ${direction}`;
      }

      // ---- Fetch paginated rows ----
      const rows = await query
        .select('*') // returns exact DB column names
        .orderByRaw(orderExpr)
        .limit(limitNum)
        .offset((pageNum - 1) * limitNum);

      res.json({
        certificates: rows,
        pagination: {
          totalRecords: total,
          totalPages: Math.ceil(total / limitNum),
          currentPage: pageNum,
          pageSize: limitNum,
          hasNext: pageNum < Math.ceil(total / limitNum),
          hasPrev: pageNum > 1
        }
      });
    } catch (error) {
      console.error('Error in getCertificates:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }

  // ===========================
  // Get single certificate by id
  // (returns exact DB column names)
  // ===========================
  static async getCertificate(req, res) {
    try {
      const certificate = await knex('eo_certificates')
        .select('*')
        .where('id', req.params.id)
        .first();

      if (!certificate) {
        return res.status(404).json({ message: 'Certificate not found' });
      }
      res.json(certificate);
    } catch (error) {
      console.error('getCertificate error:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }

  // ===========================
  // Create new certificate (Admin only)
  // Expecting body fields that map to your exact DB columns
  // e.g., req.body["EO Number"], req.body["Vehicle Make"], etc.
  // ===========================
  static async createCertificate(req, res) {
    try {
      // Build insert data with exact DB keys (JS object keys with spaces are fine if quoted)
      const data = {
        [ 'EO Number' ]: req.body['EO Number'],
        [ 'Vehicle Make' ]: req.body['Vehicle Make'],
        [ 'Vehicle Model' ]: req.body['Vehicle Model'],
        [ 'Evaporative Family' ]: req.body['Evaporative Family'],
        [ 'Vehicle Class' ]: req.body['Vehicle Class'],
        [ 'Year' ]: req.body['Year'] != null ? parseInt(req.body['Year'], 10) : null,
        [ 'Manufacturer' ]: req.body['Manufacturer'],
        [ 'Test Group' ]: req.body['Test Group'],
        [ 'Engine Size(L)' ]: req.body['Engine Size(L)'],
        [ 'Exhaust Emission Control System (ECS)' ]: req.body['Exhaust Emission Control System (ECS)'],
        created_at: knex.fn.now(),
        updated_at: knex.fn.now()
      };

      // Minimal validation
      if (!data['EO Number'] || !data['Year'] || !data['Vehicle Make'] || !data['Vehicle Model']) {
        return res.status(400).json({ message: 'Missing required fields: EO Number, Year, Vehicle Make, Vehicle Model' });
      }

      const [inserted] = await knex('eo_certificates').insert(data).returning('*');
      res.status(201).json({ message: 'Certificate created successfully', certificate: inserted });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(400).json({ message: 'Duplicate entry (unique constraint violated)', detail: error.detail });
      }
      console.error('createCertificate error:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }

  // ===========================
  // Update certificate by id (Admin only)
  // Expect body keys with exact DB names
  // ===========================
  static async updateCertificate(req, res) {
    try {
      const updateData = {
        [ 'EO Number' ]: req.body['EO Number'],
        [ 'Vehicle Make' ]: req.body['Vehicle Make'],
        [ 'Vehicle Model' ]: req.body['Vehicle Model'],
        [ 'Evaporative Family' ]: req.body['Evaporative Family'],
        [ 'Vehicle Class' ]: req.body['Vehicle Class'],
        [ 'Year' ]: req.body['Year'] != null ? parseInt(req.body['Year'], 10) : null,
        [ 'Manufacturer' ]: req.body['Manufacturer'],
        [ 'Test Group' ]: req.body['Test Group'],
        [ 'Engine Size(L)' ]: req.body['Engine Size(L)'],
        [ 'Exhaust Emission Control System (ECS)' ]: req.body['Exhaust Emission Control System (ECS)'],
        updated_at: knex.fn.now()
      };

      const [updated] = await knex('eo_certificates')
        .where('id', req.params.id)
        .update(updateData)
        .returning('*');

      if (!updated) return res.status(404).json({ message: 'Certificate not found' });
      res.json({ message: 'Certificate updated successfully', certificate: updated });
    } catch (error) {
      console.error('updateCertificate error:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }

  // ===========================
  // Delete certificate by id (Admin only)
  // ===========================
  static async deleteCertificate(req, res) {
    try {
      const deletedCount = await knex('eo_certificates')
        .where('id', req.params.id)
        .del();

      if (deletedCount === 0) return res.status(404).json({ message: 'Certificate not found' });
      res.json({ message: 'Certificate deleted successfully' });
    } catch (error) {
      console.error('deleteCertificate error:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }

  // ===========================
  // Upload Excel file (Admin only)
  // Accepts many possible header variants, maps into exact DB columns
  // ===========================
  static async uploadExcel(req, res) {
    try {
      if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

      const workbook = xlsx.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = xlsx.utils.sheet_to_json(worksheet);

      let successCount = 0;
      let errorCount = 0;
      const errors = [];

      await knex.transaction(async (trx) => {
        for (const [index, row] of jsonData.entries()) {
          try {
            const record = {
              [ 'EO Number' ]: row['EO Number'] || row['EO_number'] || row['EO no'] || row['EO'] || row.EO || row.EO_Number || row.EO_number,
              [ 'Vehicle Make' ]: row['Vehicle Make'] || row['Make'] || row.make || row.Make,
              [ 'Vehicle Model' ]: row['Vehicle Model'] || row['Model'] || row.model || row.Model,
              [ 'Evaporative Family' ]: row['Evaporative Family'] || row.evaporative_family || row['evaporative family'],
              [ 'Vehicle Class' ]: row['Vehicle Class'] || row.vehicle_class || row['Vehicle class'] || row['Class'],
              [ 'Year' ]: parseInt(row['Year'] ?? row.year ?? row.YEAR, 10),
              [ 'Manufacturer' ]: row['Manufacturer'] || row.manufacturer || row.MANUFACTURER,
              [ 'Test Group' ]: row['Test Group'] || row.test_group || row['test group'] || row.testgroup,
              [ 'Engine Size(L)' ]: row['Engine Size(L)'] || row['Engine Size'] || row.engine_size || row['engine size'] || row.enginesize,
              [ 'Exhaust Emission Control System (ECS)' ]:
                row['Exhaust Emission Control System (ECS)'] ||
                row['Exhaust ECS'] ||
                row['Exhaust ECS Special Features'] ||
                row.exhaust_ecs ||
                row.exhaustecsspecialfeatures,
              created_at: knex.fn.now(),
              updated_at: knex.fn.now()
            };

            if (!record['EO Number'] || !record['Year'] || !record['Vehicle Make'] || !record['Vehicle Model']) {
              throw new Error('Missing required fields: EO Number, Year, Vehicle Make, Vehicle Model');
            }

            await trx('eo_certificates').insert(record);
            successCount++;
          } catch (err) {
            errorCount++;
            errors.push({ row: index + 1, error: err.message });
          }
        }
      });

      // Clean up uploaded file
      const fs = require('fs');
      try { fs.unlinkSync(req.file.path); } catch (_) {}

      res.json({
        message: `Upload completed. ${successCount} certificates added, ${errorCount} errors.`,
        successCount,
        errorCount,
        errors: errors.slice(0, 10)
      });
    } catch (error) {
      console.error('uploadExcel error:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }

  // ===========================
  // Get filter options (distinct values)
  // Returns arrays of raw values (exact as in DB)
  // ===========================
  static async getFilterOptions(req, res) {
    try {
      const years = await knex('eo_certificates').distinct(knex.raw(`${COL.YEAR} as year`)).orderByRaw(`${COL.YEAR} desc`);
      const makes = await knex('eo_certificates').distinct(knex.raw(`${COL.VEHICLE_MAKE} as make`)).orderByRaw(`${COL.VEHICLE_MAKE}`);
      const models = await knex('eo_certificates').distinct(knex.raw(`${COL.VEHICLE_MODEL} as model`)).orderByRaw(`${COL.VEHICLE_MODEL}`);
      const manufacturers = await knex('eo_certificates').distinct(knex.raw(`${COL.MANUFACTURER} as manufacturer`)).orderByRaw(`${COL.MANUFACTURER}`);
      const testGroups = await knex('eo_certificates').distinct(knex.raw(`${COL.TEST_GROUP} as test_group`)).orderByRaw(`${COL.TEST_GROUP}`);
      const engineSizes = await knex('eo_certificates').distinct(knex.raw(`${COL.ENGINE_SIZE_L} as engine_size`)).orderBy('engine_size'); // alias sort ok
      const evaporativeFamilies = await knex('eo_certificates').distinct(knex.raw(`${COL.EVAPORATIVE_FAMILY} as evaporative_family`)).orderBy('evaporative_family');

      res.json({
        years: years.map(r => r.year).filter(Boolean),
        makes: makes.map(r => r.make).filter(Boolean),
        models: models.map(r => r.model).filter(Boolean),
        manufacturers: manufacturers.map(r => r.manufacturer).filter(Boolean),
        testGroups: testGroups.map(r => r.test_group).filter(Boolean),
        engineSizes: engineSizes.map(r => r.engine_size).filter(Boolean),
        evaporativeFamilies: evaporativeFamilies.map(r => r.evaporative_family).filter(Boolean)
      });
    } catch (error) {
      console.error('getFilterOptions error:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }

  // ===========================
  // Export certificates (keeps exact DB column names)
  // ===========================
  static async exportCertificates(req, res) {
    try {
      // optional filter
      const { year } = req.query;
      let query = knex('eo_certificates').select('*');

      if (year) {
        const y = parseInt(year, 10);
        if (!Number.isNaN(y)) query = query.whereRaw(`${COL.YEAR} = ?`, [y]);
      }

      const certificates = await query
        .orderByRaw(`${COL.YEAR} desc`)
        .orderByRaw(`${COL.VEHICLE_MAKE}`)
        .orderByRaw(`${COL.VEHICLE_MODEL}`);

      // Return as-is (exact DB column names)
      res.json({
        message: 'Export data prepared',
        data: certificates,
        count: certificates.length
      });
    } catch (error) {
      console.error('exportCertificates error:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }

  // ===========================
  // Bulk delete by ids
  // ===========================
  static async bulkDeleteCertificates(req, res) {
    try {
      const { certificateIds } = req.body;
      if (!Array.isArray(certificateIds) || certificateIds.length === 0) {
        return res.status(400).json({ message: 'certificateIds must be a non-empty array' });
      }

      const deletedCount = await knex('eo_certificates')
        .whereIn('id', certificateIds)
        .del();

      res.json({ message: `${deletedCount} certificates deleted`, deletedCount });
    } catch (error) {
      console.error('bulkDeleteCertificates error:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }

  // ===========================
  // Dashboard statistics
  // (uses quoted columns where needed)
  // ===========================
  static async getDashboardStats(req, res) {
    try {
      const isAdmin = req.user?.role === 'admin';

      const totalCertificates = await knex('eo_certificates').count('* as count').first();

      const certificatesByYear = await knex('eo_certificates')
        .select(knex.raw(`${COL.YEAR} as year`))
        .count('* as count')
        .groupByRaw(`${COL.YEAR}`)
        .orderBy('year', 'desc');

      const topManufacturers = await knex('eo_certificates')
        .select(knex.raw(`${COL.MANUFACTURER} as manufacturer`))
        .count('* as count')
        .whereRaw(`${COL.MANUFACTURER} IS NOT NULL`)
        .groupByRaw(`${COL.MANUFACTURER}`)
        .orderBy('count', 'desc')
        .limit(10);

      const topMakes = await knex('eo_certificates')
        .select(knex.raw(`${COL.VEHICLE_MAKE} as make`))
        .count('* as count')
        .groupByRaw(`${COL.VEHICLE_MAKE}`)
        .orderBy('count', 'desc')
        .limit(10);

      const stats = {
        totalCertificates: parseInt(totalCertificates?.count || 0, 10)
      };

      if (isAdmin) {
        const totalUsers = await knex('users').count('* as count').first();
        const pendingUsers = await knex('users').where('status', 'pending').count('* as count').first();
        const approvedUsers = await knex('users').where('status', 'approved').count('* as count').first();

        stats.totalUsers = parseInt(totalUsers?.count || 0, 10);
        stats.pendingUsers = parseInt(pendingUsers?.count || 0, 10);
        stats.approvedUsers = parseInt(approvedUsers?.count || 0, 10);

        const recentUsers = await knex('users')
          .select('id', 'username', 'email', 'status', 'created_at')
          .orderBy('created_at', 'desc')
          .limit(5);

        stats.recentUsers = recentUsers;
      }

      res.json({
        stats,
        charts: {
          certificatesByYear,
          topManufacturers,
          topMakes
        }
      });
    } catch (error) {
      console.error('getDashboardStats error:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }

  // ===========================
  // Search certificate by exact EO Number
  // ===========================
  static async searchByEONumber(req, res) {
    try {
      const { eo_number } = req.params;

      const certificate = await knex('eo_certificates')
        .select('*')
        .whereRaw(`${COL.EO_NUMBER} = ?`, [eo_number])
        .first();

      if (!certificate) return res.status(404).json({ message: 'Certificate not found' });
      res.json(certificate);
    } catch (error) {
      console.error('searchByEONumber error:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }

  // ===========================
  // Analytics endpoints
  // ===========================
  static async getCertificateAnalytics(req, res) {
    try {
      const manufacturerYearStats = await knex('eo_certificates')
        .select(
          knex.raw(`${COL.MANUFACTURER} as manufacturer`),
          knex.raw(`${COL.YEAR} as year`)
        )
        .count('* as count')
        .whereRaw(`${COL.MANUFACTURER} IS NOT NULL`)
        .groupByRaw(`${COL.MANUFACTURER}, ${COL.YEAR}`)
        .orderBy('manufacturer')
        .orderBy('year', 'desc');

      const engineSizeStats = await knex('eo_certificates')
        .select(knex.raw(`${COL.ENGINE_SIZE_L} as engine_size`))
        .count('* as count')
        .whereRaw(`${COL.ENGINE_SIZE_L} IS NOT NULL`)
        .groupByRaw(`${COL.ENGINE_SIZE_L}`)
        .orderBy('count', 'desc');

      const testGroupStats = await knex('eo_certificates')
        .select(knex.raw(`${COL.TEST_GROUP} as test_group`))
        .count('* as count')
        .whereRaw(`${COL.TEST_GROUP} IS NOT NULL`)
        .groupByRaw(`${COL.TEST_GROUP}`)
        .orderBy('count', 'desc');

      res.json({
        manufacturerYearStats,
        engineSizeStats,
        testGroupStats
      });
    } catch (error) {
      console.error('getCertificateAnalytics error:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
}

module.exports = CertificateController;
