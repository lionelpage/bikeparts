require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  user:     process.env.DB_USER     || 'bikeparts',
  password: process.env.DB_PASSWORD || 'bikeparts_secret',
  database: process.env.DB_NAME     || 'bikeparts_db',
});

module.exports = pool;
