const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
});

const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS monitors (
        id SERIAL PRIMARY KEY,
        name TEXT,
        url TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ping_logs (
        id SERIAL PRIMARY KEY,
        monitor_id INT REFERENCES monitors(id) ON DELETE CASCADE,
        status_code INT,
        response_time_ms INT,
        is_up BOOLEAN,
        checked_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log('✅ Database connected and tables verified.');
  } catch (err) {
    console.error('❌ Database initialization error:', err.message);
  }
};

module.exports = { pool, initDB };
