
import dotenv from 'dotenv';

// Load env vars
dotenv.config({ path: 'server/.env' });

const API_URL = 'https://valiant-imagination-production-0462.up.railway.app/api';

async function testForgotPassword() {
    console.log('--- Forgot Password E2E Test ---');
    console.log('Testing against:', API_URL);

    const email = 'saidromero19@gmail.com';

    try {
        console.log(`\nSending forgot-password request for: ${email}`);

        const response = await fetch(`${API_URL}/auth/forgot-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email }),
        });

        const data = await response.json();

        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(data, null, 2));

        if (response.ok) {
            console.log('\n✅ API responded successfully!');
            console.log('The email should be sending in the background.');
            console.log('Check server logs for "Password reset email sent" message.');
        } else {
            console.log('\n❌ API returned an error:', data.error || data.message);
        }
    } catch (err: any) {
        console.error('\n❌ Failed to reach API:', err.message);
        console.log('Make sure the backend server is running on', API_URL);
    }
}

testForgotPassword().catch(console.error);
