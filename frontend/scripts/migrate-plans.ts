import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database configuration
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'forma_pilates',
  user: 'cristophersaidromerojuarez',
  // No password needed for local connection
});

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('🔄 Starting migration: Update plans pricing...');

    // Read the migration file
    const migrationPath = join(__dirname, '..', 'database', 'migrations', '002_update_plans_pricing.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    // Execute the migration
    await client.query(migrationSQL);

    console.log('✅ Migration completed successfully!');

    // Verify the plans were created
    const result = await client.query('SELECT name, price, class_limit FROM plans ORDER BY sort_order');
    console.log('\n📋 Created plans:');
    result.rows.forEach((plan: any) => {
      console.log(`  - ${plan.name}: $${plan.price} (${plan.class_limit || 'unlimited'} classes)`);
    });

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(console.error);
