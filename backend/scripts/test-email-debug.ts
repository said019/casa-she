
import dotenv from 'dotenv';
import path from 'path';
import nodemailer from 'nodemailer';

// Load env vars from server/.env
dotenv.config({ path: 'server/.env' });

async function verifyEmailConfig() {
    console.log('--- Email Debugger ---');
    console.log('Current working directory:', process.cwd());
    console.log('Loading .env from: server/.env');

    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;

    console.log('GMAIL_USER:', user ? `Defined (${user})` : 'MISSING');
    console.log('GMAIL_APP_PASSWORD:', pass ? 'Defined (Recieved)' : 'MISSING');

    if (!user || !pass) {
        console.error('❌ Missing credentials. Cannot test email.');
        return;
    }

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user,
            pass,
        },
    });

    try {
        console.log('Verifying SMTP connection...');
        await transporter.verify();
        console.log('✅ SMTP Connection verified!');
    } catch (error: any) {
        console.error('❌ SMTP Connection failed:', error.message);
        console.error('Full Error:', error);
        return;
    }

    try {
        console.log('Attempting to send test email to saidromero19@gmail.com...');
        const info = await transporter.sendMail({
            from: user,
            to: 'saidromero19@gmail.com',
            subject: 'Test Email from Catarsis Debugger',
            text: 'If you receive this, the email configuration is working correctly.',
        });
        console.log('✅ Email sent successfully!');
        console.log('Message ID:', info.messageId);
    } catch (error: any) {
        console.error('❌ Failed to send email:', error.message);
    }
}

verifyEmailConfig().catch(console.error);
