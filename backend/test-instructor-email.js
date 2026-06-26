import nodemailer from 'nodemailer';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Simulate instructor data
const instructorName = 'Said Romero';
const email = 'saidromero19@gmail.com';

// Generate temporary password
const generatePassword = () => {
    return Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase();
};

const temporaryPassword = generatePassword();

async function sendInstructorCredentials() {
    console.log('🧪 Testing instructor credentials email...');
    console.log('👨‍🏫 Instructor:', instructorName);
    console.log('📧 Email:', email);
    console.log('🔑 Temp Password:', temporaryPassword);
    console.log('');

    const frontendUrl = process.env.FRONTEND_URL || 'https://catarsis-production.up.railway.app';
    const loginUrl = `${frontendUrl}/instructor/access`;

    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.GMAIL_USER,
                pass: process.env.GMAIL_APP_PASSWORD,
            },
        });

        const info = await transporter.sendMail({
            from: `${process.env.GMAIL_FROM_NAME || 'Catarsis Studio'} <${process.env.GMAIL_USER}>`,
            to: email,
            subject: '🎉 Bienvenido al Equipo de Catarsis Studio - Tus Credenciales',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                            line-height: 1.6;
                            color: #333;
                            max-width: 600px;
                            margin: 0 auto;
                            padding: 20px;
                            background-color: #f5f5f5;
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
                        h1 {
                            color: #1a1a1a;
                            font-size: 26px;
                            margin-bottom: 10px;
                        }
                        .welcome-message {
                            font-size: 16px;
                            color: #666;
                            margin-bottom: 30px;
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
                            text-align: center;
                            box-shadow: 0 4px 12px rgba(140, 132, 117, 0.3);
                        }
                        .info-box {
                            background: #fff8e1;
                            border-left: 4px solid #ffc107;
                            padding: 20px;
                            margin: 20px 0;
                            border-radius: 4px;
                        }
                        .features-list {
                            background: #f8f8f8;
                            padding: 20px 25px;
                            border-radius: 8px;
                            margin: 20px 0;
                        }
                        .features-list ul {
                            margin: 10px 0;
                            padding-left: 20px;
                        }
                        .features-list li {
                            margin: 8px 0;
                            color: #555;
                        }
                        .footer {
                            text-align: center;
                            margin-top: 40px;
                            padding-top: 25px;
                            border-top: 2px solid #eee;
                            color: #666;
                            font-size: 14px;
                        }
                        .security-note {
                            background: #ffebee;
                            border-left: 4px solid #e74c3c;
                            padding: 15px;
                            margin: 20px 0;
                            border-radius: 4px;
                            font-size: 14px;
                        }
                        .emoji {
                            font-size: 24px;
                            margin-right: 8px;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <div class="logo">CATARSIS STUDIO</div>
                            <p style="color: #999; font-size: 14px; margin-top: 10px;">Portal de Instructores</p>
                        </div>
                        
                        <h1><span class="emoji">🎉</span> ¡Bienvenido al equipo, ${instructorName}!</h1>
                        
                        <p class="welcome-message">
                            Nos emociona tenerte como parte del equipo de instructores de Catarsis Studio. 
                            Hemos creado tu cuenta en nuestro sistema y aquí están tus credenciales de acceso.
                        </p>
                        
                        <div class="credentials-box">
                            <h3 style="margin-top: 0; color: #8C8475;">🔐 Tus Credenciales de Acceso</h3>
                            
                            <div class="credential-item">
                                <div class="credential-label">📧 Email / Usuario</div>
                                <div class="credential-value">${email}</div>
                            </div>
                            
                            <div class="credential-item">
                                <div class="credential-label">🔑 Contraseña Temporal</div>
                                <div class="credential-value">${temporaryPassword}</div>
                            </div>
                        </div>
                        
                        <div style="text-align: center;">
                            <a href="${loginUrl}" class="button">
                                🚀 Acceder al Portal de Instructores
                            </a>
                        </div>
                        
                        <div class="security-note">
                            <strong>⚠️ Importante - Seguridad:</strong><br>
                            Esta es una contraseña temporal. Por seguridad, te recomendamos cambiarla en tu primer inicio de sesión.
                            Puedes hacerlo desde tu perfil una vez que entres al sistema.
                        </div>
                        
                        <div class="features-list">
                            <strong style="color: #8C8475;">📋 En tu portal podrás:</strong>
                            <ul>
                                <li>✅ Ver y gestionar tus clases programadas</li>
                                <li>✅ Actualizar tu perfil y foto</li>
                                <li>✅ Ver información de tus alumnos</li>
                                <li>✅ Gestionar tu horario de disponibilidad</li>
                                <li>✅ Revisar el historial de asistencias</li>
                            </ul>
                        </div>
                        
                        <div class="info-box">
                            <strong>💡 Primer inicio de sesión:</strong><br>
                            1. Haz clic en el botón de arriba<br>
                            2. Ingresa tu email y contraseña temporal<br>
                            3. Cambia tu contraseña por una nueva<br>
                            4. ¡Listo! Ya puedes explorar tu portal
                        </div>
                        
                        <p style="font-size: 14px; color: #666; margin-top: 30px;">
                            Si tienes alguna duda o necesitas ayuda, no dudes en contactarnos. 
                            Estamos aquí para apoyarte en todo momento.
                        </p>
                        
                        <div class="footer">
                            <p style="font-size: 16px; margin-bottom: 10px;">
                                <strong>¡Gracias por ser parte de Catarsis Studio! 💜</strong>
                            </p>
                            <p>Con cariño,<br><strong>Equipo Catarsis Studio</strong></p>
                            <p style="font-size: 12px; color: #999; margin-top: 15px;">
                                Este es un correo automático, por favor no respondas a este mensaje.
                            </p>
                        </div>
                    </div>
                </body>
                </html>
            `,
        });

        console.log('✅ Instructor credentials email sent successfully!');
        console.log('📬 Message ID:', info.messageId);
        console.log('');
        console.log('📋 Credentials Summary:');
        console.log('   Email:', email);
        console.log('   Password:', temporaryPassword);
        console.log('   Login URL:', loginUrl);
        console.log('');
        console.log('🎉 Check your inbox at', email);
        
        // Hash password to show what would be saved in DB
        const hashedPassword = await bcrypt.hash(temporaryPassword, 12);
        console.log('');
        console.log('🔐 Password hash (for DB):', hashedPassword.substring(0, 30) + '...');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Exception:', error);
        process.exit(1);
    }
}

sendInstructorCredentials();
