import { pool } from '../src/config/database.js';

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log('Starting migration...');
        await client.query('BEGIN');

        // Check if column exists to avoid errors on re-run
        const checkColumn = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='memberships' AND column_name='cancellations_used'
    `);

        if (checkColumn.rowCount === 0) {
            await client.query(`
        ALTER TABLE memberships 
        ADD COLUMN cancellations_used INTEGER DEFAULT 0,
        ADD COLUMN cancellation_limit INTEGER DEFAULT 2
      `);
            console.log('✅ Added cancellations_used and cancellation_limit columns');
        } else {
            console.log('ℹ️ Columns already exist, skipping');
        }

        await client.query('COMMIT');
        console.log('Migration completed successfully');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error running migration:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
