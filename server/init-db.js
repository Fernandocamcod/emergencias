// init-db.js — Run once to create tables in Neon PostgreSQL
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function initDB() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('✅ Database schema initialized successfully!');
    console.log('   Tables created: users, alerts');
  } catch (err) {
    console.error('❌ Error initializing database:', err.message);
  } finally {
    await pool.end();
  }
}

initDB();
