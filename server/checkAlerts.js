const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    console.log(`🔍 Consultando alertas en la base de datos...`);
    const res = await pool.query('SELECT * FROM alerts ORDER BY timestamp DESC');
    console.log(`✅ Se encontraron ${res.rows.length} alertas.`);
    if (res.rows.length > 0) {
      console.log('Última alerta:', JSON.stringify(res.rows[0], null, 2));
    }
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
}

main();
