import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { levantarServidorLocal, http } from './helpers/servidor-local.js';

const srv = await levantarServidorLocal(3230, { whatsappUnavailable: true });
process.env.DATABASE_URL = srv.databaseUrl;
const { pool } = await import('../src/config/database.js');
try {
    const password = 'Prueba-Delivery-123';
    await pool.query(`INSERT INTO users(email,phone,display_name,role,password_hash,is_active)
        VALUES('delivery-admin@test.local','5577889900','Delivery Admin','admin',$1,true)`, [await bcrypt.hash(password, 4)]);
    const login = await http(srv.api, 'POST', '/auth/login', undefined, { email: 'delivery-admin@test.local', password });
    assert.equal(login.status, 200);
    const token = login.json.token;
    const created = await http(srv.api, 'POST', '/users', token, { displayName: 'Entrega Fallida', phone: '5577889901', password });
    assert.equal(created.status, 201, JSON.stringify(created.json));
    assert.equal(created.json.emailSent, false);
    assert.equal(created.json.whatsappSent, false, 'fulfilled false must not claim delivery on creation');
    const resend = await http(srv.api, 'POST', `/users/${created.json.user.id}/resend-credentials`, token, {});
    assert.equal(resend.status, 200, JSON.stringify(resend.json));
    assert.equal(resend.json.emailSent, false);
    assert.equal(resend.json.whatsappSent, false, 'fulfilled false must not claim delivery on resend');
    assert.ok(resend.json.tempPassword, 'staff retains manual fallback credentials');
    console.log('PASS truthful WhatsApp creation/resend delivery status');
} finally {
    await pool.end();
    await srv.detener();
}
