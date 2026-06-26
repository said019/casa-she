import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

async function testGmail() {
    console.log('🧪 Testing Gmail SMTP configuration...\n');
    
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;
    
    if (!gmailUser || !gmailPass) {
        console.error('❌ Error: GMAIL_USER and GMAIL_APP_PASSWORD must be set in .env file');
        console.log('\n📝 How to setup:');
        console.log('1. Go to https://myaccount.google.com/apppasswords');
        console.log('2. Create a new app password for "Mail"');
        console.log('3. Add to .env file:');
        console.log('   GMAIL_USER=your-email@gmail.com');
        console.log('   GMAIL_APP_PASSWORD=your-16-char-password');
        process.exit(1);
    }
    
    console.log('📧 Gmail User:', gmailUser);
    console.log('🔑 App Password:', gmailPass ? '✅ Set' : '❌ Not set');
    console.log('');
    
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: gmailUser,
                pass: gmailPass,
            },
        });
        
        console.log('📨 Sending test email...');
        
        const info = await transporter.sendMail({
            from: `Catarsis Studio <${gmailUser}>`,
            to: 'saidromero19@gmail.com',
            subject: '🧪 Test - Gmail SMTP Configuration',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #8C8475;">✅ Gmail SMTP Working!</h2>
                    <p>This is a test email from your Catarsis Studio application.</p>
                    <p>Your Gmail SMTP configuration is working correctly!</p>
                    <div style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <strong>From:</strong> ${gmailUser}<br>
                        <strong>Service:</strong> Gmail SMTP<br>
                        <strong>Status:</strong> ✅ Connected
                    </div>
                    <p style="color: #666; font-size: 14px;">
                        Now you can send emails to any address without domain verification!
                    </p>
                </div>
            `,
        });
        
        console.log('✅ Email sent successfully!');
        console.log('📬 Message ID:', info.messageId);
        console.log('📧 Accepted:', info.accepted);
        console.log('');
        console.log('🎉 Gmail SMTP is working! Check your inbox at saidromero19@gmail.com');
        
    } catch (error) {
        console.error('❌ Error sending email:', error.message);
        console.log('\n💡 Common issues:');
        console.log('- Make sure you created an App Password (not your regular Gmail password)');
        console.log('- Go to: https://myaccount.google.com/apppasswords');
        console.log('- Enable 2-Step Verification first if not enabled');
        console.log('- Create a new app password for "Mail"');
        process.exit(1);
    }
}

testGmail();
