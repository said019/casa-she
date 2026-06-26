import { Resend } from 'resend';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

async function testEmail() {
    console.log('🧪 Testing email send...');
    console.log('📧 To: saidromero19@gmail.com');
    console.log('🔑 API Key:', process.env.RESEND_API_KEY ? '✅ Set' : '❌ Not set');
    console.log('📨 From:', process.env.RESEND_FROM_EMAIL || 'Catarsis Studio <onboarding@resend.dev>');
    console.log('');

    try {
        const { data, error } = await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || 'Catarsis Studio <onboarding@resend.dev>',
            to: ['saidromero19@gmail.com'],
            subject: '🧪 Prueba de Email - Catarsis Studio',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            line-height: 1.6;
                            color: #333;
                            max-width: 600px;
                            margin: 0 auto;
                            padding: 20px;
                        }
                        .container {
                            background: #ffffff;
                            border-radius: 12px;
                            padding: 40px;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                        }
                        .header {
                            text-align: center;
                            margin-bottom: 30px;
                            padding-bottom: 20px;
                            border-bottom: 3px solid #8C8475;
                        }
                        .logo {
                            font-size: 32px;
                            font-weight: bold;
                            color: #8C8475;
                            letter-spacing: 1px;
                        }
                        .credentials-box {
                            background: linear-gradient(135deg, #f8f8f8 0%, #e8e5dd 100%);
                            border-left: 4px solid #8C8475;
                            padding: 25px;
                            margin: 25px 0;
                            border-radius: 8px;
                        }
                        .credential-item {
                            margin: 15px 0;
                            padding: 12px;
                            background: white;
                            border-radius: 6px;
                        }
                        .credential-label {
                            font-size: 12px;
                            text-transform: uppercase;
                            letter-spacing: 0.5px;
                            color: #8C8475;
                            font-weight: 600;
                            margin-bottom: 5px;
                        }
                        .credential-value {
                            font-size: 16px;
                            font-weight: 600;
                            color: #1a1a1a;
                            font-family: 'Courier New', monospace;
                        }
                        .button {
                            display: inline-block;
                            background: linear-gradient(135deg, #8C8475 0%, #73695e 100%);
                            color: white !important;
                            text-decoration: none;
                            padding: 16px 40px;
                            border-radius: 8px;
                            margin: 25px 0;
                            font-weight: 600;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <div class="logo">CATARSIS STUDIO</div>
                            <p style="color: #999; font-size: 14px; margin-top: 10px;">Portal de Instructores</p>
                        </div>
                        
                        <h1>🧪 Email de Prueba</h1>
                        
                        <p>
                            Este es un email de prueba para verificar que el sistema de envío de credenciales funciona correctamente.
                        </p>
                        
                        <div class="credentials-box">
                            <h3 style="margin-top: 0; color: #8C8475;">📋 Información de Prueba</h3>
                            
                            <div class="credential-item">
                                <div class="credential-label">📧 Email de Destino</div>
                                <div class="credential-value">saidromero19@gmail.com</div>
                            </div>
                            
                            <div class="credential-item">
                                <div class="credential-label">🔑 Contraseña de Prueba</div>
                                <div class="credential-value">TestPassword123!</div>
                            </div>
                        </div>
                        
                        <div style="text-align: center;">
                            <a href="https://catarsis-production.up.railway.app/instructor/access" class="button">
                                🚀 Acceder al Portal (Prueba)
                            </a>
                        </div>
                        
                        <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px;">
                            <strong>✅ Si recibes este email, el sistema funciona correctamente.</strong>
                        </p>
                        
                        <div style="text-align: center; margin-top: 30px; color: #999; font-size: 12px;">
                            <p>Catarsis Studio - Sistema de Gestión</p>
                            <p>Este es un correo automático de prueba</p>
                        </div>
                    </div>
                </body>
                </html>
            `,
        });

        if (error) {
            console.error('❌ Error sending email:', error);
            process.exit(1);
        }

        console.log('✅ Email sent successfully!');
        console.log('📬 Response:', data);
        console.log('');
        console.log('🎉 Check your inbox at saidromero19@gmail.com');
        process.exit(0);
    } catch (error) {
        console.error('❌ Exception:', error);
        process.exit(1);
    }
}

testEmail();
