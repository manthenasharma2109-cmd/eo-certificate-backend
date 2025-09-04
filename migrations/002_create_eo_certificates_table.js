// migrations/002_create_eo_certificates_table.js
exports.up = function(knex) {
    return knex.schema.createTable('eo_certificates', function(table) {
      table.increments('id').primary();
      table.string('eo_number').notNullable().unique();
      table.integer('year').notNullable();
      table.string('model').notNullable();
      table.string('make').notNullable();
      table.string('manufacturer');
      table.string('test_group');
      table.string('engine_size');
      table.string('evaporative_family');
      table.text('exhaust_ecs_special_features');
      table.timestamps(true, true);
      
      // Indexes for better query performance
      table.index(['year']);
      table.index(['make']);
      table.index(['model']);
      table.index(['manufacturer']);
      table.index(['eo_number']);
    });
  };
  
  exports.down = function(knex) {
    return knex.schema.dropTable('eo_certificates');
  };