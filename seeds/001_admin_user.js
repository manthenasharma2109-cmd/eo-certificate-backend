// seeds/001_admin_user.js - Seed file to create default admin user
const bcrypt = require('bcryptjs');

exports.seed = async function(knex) {
  // Check if admin already exists
  const adminExists = await knex('users').where('role', 'admin').first();
  
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    await knex('users').insert({
      username: 'admin',
      email: 'admin@example.com',
      password: hashedPassword,
      role: 'admin',
      status: 'approved',
      created_at: new Date(),
      updated_at: new Date()
    });
    
    console.log('Default admin user created: admin@example.com / admin123');
  }
};