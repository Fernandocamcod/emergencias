// index.js — AlertaEmergencia API Server (Express + PostgreSQL Neon)
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const pool    = require('./db');
const fs      = require('fs');

// ---- Auto-Initialize Database ----
async function ensureTables() {
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('✅ Base de datos verificada/inicializada.');
  } catch (err) {
    console.warn('⚠️ Nota sobre DB:', err.message);
  }
}
ensureTables();

const app  = express();
const PORT = process.env.PORT || 3001;

// ---- Middleware ----
app.use(cors());
app.use(express.json());

// ---- Request Logging ----
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} | ${req.method} ${req.url}`);
  if (req.method === 'POST' || req.method === 'PATCH') {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// ---- Serve Static Files (Frontend) ----
app.use(express.static(path.join(__dirname, '../public')));

// ---- Health check ----
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ======================
//   USERS
// ======================

// GET /api/users/:uid — get user profile
app.get('/api/users/:uid', async (req, res) => {
  try {
    const { uid } = req.params;
    const r = await pool.query('SELECT * FROM users WHERE uid = $1', [uid]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(rowToUser(r.rows[0]));
  } catch (err) {
    console.error('GET /api/users/:uid', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/:uid — create or update user profile (upsert)
app.post('/api/users/:uid', async (req, res) => {
  try {
    const { uid } = req.params;
    const { email, name, phone, emergencyContact, role } = req.body;
    const r = await pool.query(
      `INSERT INTO users (uid, email, name, phone, emergency_contact, role, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (uid) DO UPDATE SET
         email             = EXCLUDED.email,
         name              = COALESCE(EXCLUDED.name, users.name),
         phone             = COALESCE(EXCLUDED.phone, users.phone),
         emergency_contact = COALESCE(EXCLUDED.emergency_contact, users.emergency_contact),
         role              = COALESCE(EXCLUDED.role, users.role),
         updated_at        = NOW()
       RETURNING *`,
      [uid, email, name || null, phone || null, emergencyContact || null, role || 'user']
    );
    res.json(rowToUser(r.rows[0]));
  } catch (err) {
    console.error('POST /api/users/:uid', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ======================
//   ALERTS
// ======================

// GET /api/alerts — list all alerts (ordered by newest first)
app.get('/api/alerts', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM alerts ORDER BY timestamp DESC');
    res.json(r.rows.map(rowToAlert));
  } catch (err) {
    console.error('GET /api/alerts', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/alerts — create new alert
app.post('/api/alerts', async (req, res) => {
  try {
    const {
      uid, email, name, phone, emergencyContact,
      type, typeLabel, message, lat, lng, status
    } = req.body;

    const r = await pool.query(
      `INSERT INTO alerts
         (uid, email, name, phone, emergency_contact, type, type_label, message, lat, lng, status, timestamp, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
       RETURNING *`,
      [uid, email, name, phone || null, emergencyContact || null,
       type, typeLabel, message || null,
       lat != null ? lat : null, lng != null ? lng : null,
       status || 'active']
    );
    res.status(201).json(rowToAlert(r.rows[0]));
  } catch (err) {
    console.error('POST /api/alerts', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/alerts/:id — update alert fields (status, lat, lng, etc.)
app.patch('/api/alerts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const fields = req.body; // can include: status, lat, lng, message

    // Build dynamic SET clause
    const allowed = ['status', 'lat', 'lng', 'message'];
    const sets    = [];
    const vals    = [];
    let   i       = 1;

    for (const key of allowed) {
      if (fields[key] !== undefined) {
        sets.push(`${key} = $${i++}`);
        vals.push(fields[key]);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

    sets.push(`updated_at = NOW()`);
    vals.push(id);

    const r = await pool.query(
      `UPDATE alerts SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      vals
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Alert not found' });
    res.json(rowToAlert(r.rows[0]));
  } catch (err) {
    console.error('PATCH /api/alerts/:id', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ======================
//   HELPERS
// ======================

function rowToUser(row) {
  return {
    uid:              row.uid,
    email:            row.email,
    name:             row.name,
    phone:            row.phone,
    emergencyContact: row.emergency_contact,
    role:             row.role,
    createdAt:        row.created_at,
    updatedAt:        row.updated_at,
  };
}

function rowToAlert(row) {
  return {
    _id:              row.id,
    uid:              row.uid,
    email:            row.email,
    name:             row.name,
    phone:            row.phone,
    emergencyContact: row.emergency_contact,
    type:             row.type,
    typeLabel:        row.type_label,
    message:          row.message,
    lat:              row.lat,
    lng:              row.lng,
    status:           row.status,
    timestamp:        row.timestamp,
    updatedAt:        row.updated_at,
  };
}

// ---- Start ----
console.log(`⏳ Intentando iniciar servidor en puerto ${PORT}...`);
app.listen(PORT, () => {
  console.log(`🚀 AlertaEmergencia API running on port ${PORT}`);
  console.log(`   Health: /api/health`);
});
