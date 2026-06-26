#!/usr/bin/env node
// Actualiza la capacidad a 6 de todas las clases futuras.
// Salta las que tengan más de 6 reservas actuales (no se pueden reducir).

const API = 'https://balance-room-api-production.up.railway.app/api';
const ADMIN_EMAIL = 'admin@balanceroom.mx';
const ADMIN_PASSWORD = 'Gkn7DCG7qUn00HHD';
const TARGET = 6;

async function req(p, { method = 'GET', token, body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch(`${API}${p}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { ok: r.ok, status: r.status, data };
}

async function pool(tasks, concurrency = 8) {
    let i = 0;
    async function worker() {
        while (i < tasks.length) {
            const idx = i++;
            await tasks[idx]();
        }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
}

async function main() {
    const login = await req('/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    if (!login.ok) throw new Error('Login falló');
    const token = login.data.token;
    console.log('Login OK');

    const today = new Date().toISOString().slice(0, 10);
    const cr = await req(`/classes?start=${today}&end=2027-12-31`, { token });
    const classes = Array.isArray(cr.data) ? cr.data : (cr.data?.classes ?? []);
    console.log(`Total clases futuras: ${classes.length}`);

    const toUpdate = classes.filter(c => c.max_capacity !== TARGET && c.status !== 'cancelled' && (c.current_bookings ?? 0) <= TARGET);
    const skipped = classes.filter(c => c.max_capacity !== TARGET && (c.current_bookings ?? 0) > TARGET);
    const alreadyOk = classes.filter(c => c.max_capacity === TARGET).length;

    console.log(`  Ya tienen capacidad ${TARGET}: ${alreadyOk}`);
    console.log(`  A actualizar:           ${toUpdate.length}`);
    console.log(`  Saltadas (>${TARGET} reservas):  ${skipped.length}`);
    if (skipped.length) {
        console.log('  Detalle de saltadas:');
        skipped.slice(0, 10).forEach(c => console.log(`    ${c.id} | ${c.date} ${c.start_time} | ${c.current_bookings} reservas`));
        if (skipped.length > 10) console.log(`    ...y ${skipped.length - 10} más`);
    }

    let ok = 0, fail = 0;
    await pool(toUpdate.map(cls => async () => {
        const r = await req(`/classes/${cls.id}`, { method: 'PUT', token, body: { maxCapacity: TARGET } });
        if (r.ok) {
            ok++;
            if (ok % 50 === 0) console.log(`  ${ok}/${toUpdate.length}...`);
        } else {
            fail++;
            console.log(`  FAIL ${cls.id}: ${JSON.stringify(r.data).slice(0, 100)}`);
        }
    }), 8);

    console.log(`\nActualizadas: ${ok} OK, ${fail} errores`);
    console.log('Listo.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
