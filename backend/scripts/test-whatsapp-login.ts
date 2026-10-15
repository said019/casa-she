import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { levantarServidorLocal, http } from './helpers/servidor-local.js';

const srv = await levantarServidorLocal(3229);
process.env.DATABASE_URL = srv.databaseUrl;
const { pool } = await import('../src/config/database.js');
const sql = async (s: string, p: unknown[] = []) => (await pool.query(s, p)).rows;
const password = 'Prueba-Login-123';
const request = (path: string, body: unknown, token?: string) => http(srv.api, 'POST', path, token, body);
try {
    const hash = await bcrypt.hash(password, 4);
    const admin = (await sql(`INSERT INTO users(email,phone,display_name,role,password_hash,is_active)
        VALUES('whatsapp-admin@test.local','5577000000','Admin Prueba','admin',$1,true) RETURNING id`, [hash]))[0];
    const adminLogin = await request('/auth/login', { email: 'whatsapp-admin@test.local', password });
    const token = adminLogin.json.token;
    assert.ok(token);
    const staff = await request('/users/reception', { email: 'new-staff-whatsapp@test.local', display_name: 'Nueva Recepción', password }, token);
    assert.equal(staff.status, 201, `staff without phone: ${JSON.stringify(staff.json)}`);
    await sql(`INSERT INTO users(email,phone,display_name,role,password_hash,is_active)
        VALUES('sentinel-staff1@test.local','0000000000','Staff Sentinel','reception',$1,true),
              ('sentinel-staff2@test.local','0000000000','Staff Sentinel Dos','reception',$1,true)`, [hash]);
    const sentinel = (await sql(`SELECT id FROM users WHERE email='sentinel-staff1@test.local'`))[0];
    const staffEdit = await http(srv.api, 'PUT', `/users/${sentinel.id}`, token, { email: 'sentinel-edited@test.local' });
    assert.equal(staffEdit.status, 200, JSON.stringify(staffEdit.json));
    for (const phone of ['0000000000', '+520000000000', '5210000000000']) {
        assert.equal((await sql('SELECT normalize_login_phone($1) AS phone', [phone]))[0].phone, null);
        assert.equal((await request('/users', { displayName: 'No Sentinel', phone, password }, token)).status, 400);
        assert.equal((await request('/auth/login', { identifier: phone, password })).status, 401);
    }
    const created = await request('/users', { displayName: 'Sin Correo', phone: '5577000001', password }, token);
    assert.equal(created.status, 201, `standalone optional email: ${JSON.stringify(created.json)}`);
    const id = created.json.user.id;
    assert.equal(created.json.user.email, null);
    assert.equal((await sql('SELECT email FROM users WHERE id=$1', [id]))[0].email, null);
    const edited = await http(srv.api, 'PUT', `/users/${id}`, token, { email: '', displayName: 'Sin Correo Editada' });
    assert.equal(edited.status, 200, `nullable profile: ${JSON.stringify(edited.json)}`);
    assert.equal(edited.json.user.email, null);
    for (const phone of ['abcdefgh', '999525577000001', 'letters5577000001']) {
        const invalidEdit = await http(srv.api, 'PUT', `/users/${id}`, token, { phone });
        assert.equal(invalidEdit.status, 400, `phone-only profile update: ${JSON.stringify(invalidEdit.json)}`);
        assert.equal((await sql('SELECT phone FROM users WHERE id=$1', [id]))[0].phone, '5577000001');
    }
    for (const identifier of ['5577000001', '+52 55 7700 0001', '5215577000001']) {
        const login = await request('/auth/login', { identifier, password });
        assert.equal(login.status, 200, JSON.stringify(login.json));
        assert.equal(login.json.user.id, id);
        assert.equal(login.json.user.password_hash, undefined);
        const profile = await http(srv.api, 'GET', '/auth/me', login.json.token);
        assert.equal(profile.status, 200);
        assert.equal(profile.json.user.email, null);
    }
    assert.equal((await request('/auth/login', { email: ' WHATSAPP-ADMIN@TEST.LOCAL ', password })).status, 200);
    const clientToken = (await request('/auth/login', { identifier: '5577000001', password })).json.token;
    await sql('UPDATE users SET temp_password=true WHERE id=$1', [id]);
    for (const phone of ['+15577000003', 'letters5577000001']) {
        const onboard = await request('/auth/complete-onboarding', { newPassword: password, displayName: 'Sin Correo', phone }, clientToken);
        assert.equal(onboard.status, 400, `onboarding invalid phone: ${JSON.stringify(onboard.json)}`);
        assert.equal((await sql('SELECT phone FROM users WHERE id=$1', [id]))[0].phone, '5577000001');
    }
    const onboard = await request('/auth/complete-onboarding', { newPassword: password, displayName: 'Sin Correo', phone: '+52 55 7700 0001' }, clientToken);
    assert.equal(onboard.status, 200, JSON.stringify(onboard.json));
    assert.equal(onboard.json.user.phone, '5577000001');
    await sql('UPDATE users SET phone=$1 WHERE id=$2', ['+52 1 55 7700 0001', id]);
    assert.equal((await request('/auth/login', { identifier: '5577000001', password })).status, 200, 'legacy stored phone');
    await sql(`INSERT INTO users(email,phone,display_name,role,password_hash,is_active)
        VALUES(NULL,'5577000006','Sin contraseña','client',NULL,true)`);
    assert.equal((await request('/auth/login', { identifier: '5577000006', password })).status, 401, 'missing password hash must fail generically');
    const wrong = await request('/auth/login', { identifier: '5577000001', password: 'incorrecta' });
    assert.equal(wrong.status, 401);
    await sql('UPDATE users SET is_active=false WHERE id=$1', [id]);
    const inactive = await request('/auth/login', { identifier: '5577000001', password });
    assert.deepEqual(inactive.json, wrong.json);
    assert.equal(inactive.status, 401);
    await sql('UPDATE users SET is_active=true WHERE id=$1', [id]);
    for (const identifier of ['5577000001', '5577999999', 'desconocido@test.local']) {
        const forgot = await request('/auth/forgot-password', { identifier });
        assert.equal(forgot.status, 200);
        assert.deepEqual(Object.keys(forgot.json), ['message']);
    }
    const publicBody = { displayName: 'Registro Público', phone: '+525577000002', password, acceptsTerms: true };
    const pub = await request('/auth/register', publicBody);
    assert.equal(pub.status, 201, JSON.stringify(pub.json));
    assert.equal(pub.json.user.email, null);
    for (const phone of ['123', '999525577000003', 'abc5577000003', '+15577000003']) {
        assert.equal((await request('/users', { displayName: 'Inválido', phone }, token)).status, 400);
        assert.equal((await request('/auth/register', { ...publicBody, phone })).status, 400);
    }
    assert.equal((await request('/users', { displayName: 'Inválido', phone: '5577000003', email: 'oops' }, token)).status, 400);
    assert.equal((await request('/auth/register', { ...publicBody, email: 'oops', phone: '5577000003' })).status, 400);
    const races = await Promise.all([
        request('/users', { displayName: 'Concurrente A', phone: '5577000004', email: '' }, token),
        request('/auth/register', { ...publicBody, phone: '+525577000004', email: '  ' }),
    ]);
    assert.deepEqual(races.map(r => r.status).sort(), [201, 409]);
    const instructor = (await sql('SELECT id FROM instructors LIMIT 1'))[0];
    const type = (await sql(`INSERT INTO class_types(name,category,max_capacity) VALUES('WhatsApp test','multi',10) RETURNING id`))[0];
    const cls = (await sql(`INSERT INTO classes(class_type_id,instructor_id,date,start_time,end_time,max_capacity)
        VALUES($1,$2,(NOW() AT TIME ZONE 'America/Mexico_City')::date+5,'15:00','16:00',10) RETURNING id`, [type.id, instructor.id]))[0];
    const alta = await request('/users/alta-rapida', { nombre: 'Alta Sin Correo', telefono: '5577000005', classId: cls.id, cortesia: true }, token);
    assert.equal(alta.status, 201, JSON.stringify(alta.json));
    assert.equal(alta.json.user.email, null);
    assert.equal((await sql('SELECT email FROM users WHERE id=$1', [alta.json.user.id]))[0].email, null);
    const link = alta.json.acceso.url.split('/').pop();
    const access = await request(`/auth/acceso/${link}`, { password });
    assert.equal(access.status, 200, JSON.stringify(access.json));
    assert.equal((await request('/auth/login', { identifier: '5577000005', password })).status, 200);
    // Simulate historical ambiguity without weakening the application's create path.
    await sql('ALTER TABLE users DISABLE TRIGGER users_identity_guard');
    await sql(`INSERT INTO users(email,phone,display_name,role,password_hash,is_active)
        VALUES(NULL,'+525577000001','Duplicado histórico','client',$1,true)`, [hash]);
    await sql('ALTER TABLE users ENABLE TRIGGER users_identity_guard');
    const ambiguous = await request('/auth/login', { identifier: '5577000001', password });
    assert.equal(ambiguous.status, 401);
    assert.deepEqual(ambiguous.json, wrong.json);
    assert.equal((await request('/auth/forgot-password', { identifier: '5577000001' })).json.token, undefined);
    const { clientIdentityDDL } = await import('../src/lib/loginIdentity.js');
    await sql(clientIdentityDDL);
    // Startup seeds rely on ON CONFLICT(email), including reruns after deployment.
    await sql(`INSERT INTO users(email,phone,display_name,role,password_hash)
        VALUES('whatsapp-admin@test.local','5577000000','Admin Prueba','admin',$1)
        ON CONFLICT(email) DO UPDATE SET display_name=EXCLUDED.display_name`, [hash]);
    console.log('PASS WhatsApp login, nullable email, registration, concurrency and recovery');
} finally {
    await pool.end();
    await srv.detener();
}
