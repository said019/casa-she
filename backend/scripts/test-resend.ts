
import { Resend } from 'resend';

const resend = new Resend('re_6dSMXnm2_DLBmdb8LVZQXz4ZNMq5qZwe3');

async function testResend() {
    console.log('--- Testing Resend ---');

    try {
        const { data, error } = await resend.emails.send({
            from: 'Catarsis Studio <noreply@agendafull.com.mx>',
            to: ['pspsaid019@gmail.com'],
            subject: '✅ Prueba de Resend - Catarsis Studio',
            html: '<h1>¡Funciona!</h1><p>Si recibes este correo, Resend está configurado correctamente.</p>',
        });

        if (error) {
            console.error('❌ Error:', error);
            return;
        }

        console.log('✅ Email enviado exitosamente!');
        console.log('ID:', data?.id);
    } catch (err: any) {
        console.error('❌ Error:', err.message);
    }
}

testResend();
