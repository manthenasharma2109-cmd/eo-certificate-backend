// migrations/001_create_users_table.js
exports.up = function(knex) {
    return knex.schema.createTable('users', function(table) {
      table.increments('id').primary();
      table.string('username').notNullable().unique();
      table.string('email').notNullable().unique();
      table.string('password').notNullable();
      table.enu('role', ['user', 'admin']).defaultTo('user');
      table.enu('status', ['pending', 'approved', 'denied']).defaultTo('pending');
      table.timestamps(true, true);
    });
  };
  
  exports.down = function(knex) {
    return knex.schema.dropTable('users');
  };