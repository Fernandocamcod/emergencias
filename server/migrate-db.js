const pool = require('./db');

async function migrate() {
  console.log('--- STARTING DB MIGRATION ---');
  try {
    // Add columns to 'users'
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT`);
    console.log('✅ Users table updated.');

    // Add columns to 'alerts'
    await pool.query(`ALTER TABLE alerts ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT`);
    await pool.query(`ALTER TABLE alerts ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT`);
    console.log('✅ Alerts table updated.');

    // Optional: Migrate old data if possible (e.g., copy emergency_contact to emergency_contact_name)
    await pool.query(`UPDATE users SET emergency_contact_name = emergency_contact WHERE emergency_contact_name IS NULL AND emergency_contact IS NOT NULL`);
    await pool.query(`UPDATE alerts SET emergency_contact_name = emergency_contact WHERE emergency_contact_name IS NULL AND emergency_contact IS NOT NULL`);
    console.log('✅ Data migration complete.');

  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    process.exit(0);
  }
}

migrate();
