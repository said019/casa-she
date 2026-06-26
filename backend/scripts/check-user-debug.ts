
import dotenv from 'dotenv';
import pg from 'pg';

// Load env vars
dotenv.config({ path: 'server/.env' });

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Disable SSL for local connection check attempts if it fails
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function checkUser() {
    console.log('--- User Debugger ---');
    const email = 'saidromero19@gmail.com'; // Hardcoded for check

    try {
        console.log(`Checking for user: ${email}`);
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (result.rows.length > 0) {
            console.log('✅ User FOUND!');
            console.log('User ID:', result.rows[0].id);
            console.log('Role:', result.rows[0].role);
        } else {
            console.log('❌ User NOT FOUND in database.');
            console.log('This explains why no password reset email is sent.');
        }
    } catch (err: any) {
        console.error('Database Error:', err.message);
    } finally {
        await pool.end();
    }
}

checkUser().catch(console.error);
