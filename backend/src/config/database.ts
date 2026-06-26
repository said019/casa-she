import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Railway PostgreSQL proxy does NOT use SSL
const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
    console.error('❌ DATABASE_URL is not set!');
}

try {
    const parsed = new URL(dbUrl || '');
    console.log(`📍 DATABASE_URL host: ${parsed.hostname}:${parsed.port || '5432'}`);
} catch {
    console.error('❌ DATABASE_URL format is invalid');
}

// Create connection pool - NO SSL for Railway
export const pool = new Pool({
    connectionString: dbUrl,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
    max: 10,
});

// Test connection
pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('❌ Unexpected error on idle client', err.message);
});

// Startup connection test with retry
(async () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            const client = await pool.connect();
            const res = await client.query('SELECT NOW()');
            client.release();
            console.log(`✅ Database connection verified (attempt ${attempt}):`, res.rows[0].now);
            return;
        } catch (err: any) {
            console.error(`❌ DB connection attempt ${attempt}/5 failed:`, err.message);
            if (attempt < 5) {
                await new Promise(r => setTimeout(r, 3000 * attempt));
            }
        }
    }
    console.error('⚠️ Could not connect to database after 5 attempts. Server will retry on requests.');
})();

// Helper function for queries
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
    const result = await pool.query(text, params);
    return result.rows as T[];
}

// Helper for single row
export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
    const rows = await query<T>(text, params);
    return rows[0] || null;
}

export default pool;
