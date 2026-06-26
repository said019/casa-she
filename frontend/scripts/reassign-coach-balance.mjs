#!/usr/bin/env node
// Reasigna clases futuras de Coach Balance a otras coaches al azar,
// luego desactiva Coach Balance.

const API = 'https://balance-room-api-production.up.railway.app/api';
const COACH_BALANCE_ID = 'c7c8df49-697c-4a83-91e8-220eb30b8712';
const ADMIN_EMAIL = 'admin@balanceroom.mx';
const ADMIN_PASSWORD = 'Gkn7DCG7qUn00HHD';

async function req(path_, { method = 'GET', token, body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API}${path_}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { ok: res.ok, status: res.status, data };
}

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// Run N promises with max concurrency
async function pool(tasks, concurrency = 10) {
    const results = [];
    let i = 0;
    async function worker() {
        while (i < tasks.length) {
            const idx = i++;
            results[idx] = await tasks[idx]();
        }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    return results;
}

async function main() {
    // 1. Login
    const login = await req('/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    if (!login.ok) throw new Error('Login falló');
    const token = login.data.token;
    console.log('Login OK');

    // 2. Obtener todas las coaches activas (excepto Coach Balance)
    const instrRes = await req('/instructors', { token });
    const coaches = instrRes.data.filter(i => i.id !== COACH_BALANCE_ID && i.is_active);
    console.log(`Coaches disponibles (${coaches.length}): ${coaches.map(c => c.display_name).join(', ')}`);

    // 3. Obtener clases futuras de Coach Balance
    const today = new Date().toISOString().slice(0, 10);
    const classRes = await req(`/classes?start=${today}&end=2027-12-31`, { token });
    const allClasses = Array.isArray(classRes.data) ? classRes.data : (classRes.data?.classes ?? []);
    const toReassign = allClasses.filter(c => c.instructor_id === COACH_BALANCE_ID && c.status !== 'cancelled');
    console.log(`Clases futuras a reasignar: ${toReassign.length}`);

    // 4. Reasignar en paralelo (concurrencia 8)
    let ok = 0, fail = 0;
    const tasks = toReassign.map(cls => async () => {
        const newCoach = pick(coaches);
        const res = await req(`/classes/${cls.id}`, {
            method: 'PUT',
            token,
            body: { instructorId: newCoach.id },
        });
        if (res.ok) {
            ok++;
            if (ok % 50 === 0) console.log(`  ${ok}/${toReassign.length} reasignadas...`);
        } else {
            fail++;
            console.log(`  FAIL clase ${cls.id}: ${JSON.stringify(res.data).slice(0, 100)}`);
        }
    });

    await pool(tasks, 8);
    console.log(`\nReasignadas: ${ok} OK, ${fail} errores`);

    // 5. Desactivar Coach Balance
    const del = await req(`/instructors/${COACH_BALANCE_ID}`, { method: 'DELETE', token });
    if (del.ok) {
        console.log('Coach Balance desactivada ✓');
    } else {
        console.log('Error al desactivar:', JSON.stringify(del.data));
    }

    console.log('\nListo.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
