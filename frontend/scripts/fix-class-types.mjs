#!/usr/bin/env node
// 1) Reasigna las 6 clases del Silla Wunda duplicado al original
// 2) Desactiva el Silla Wunda duplicado
// 3) Actualiza la capacidad de todas las disciplinas a 6

const API = 'https://balance-room-api-production.up.railway.app/api';
const ADMIN_EMAIL = 'admin@balanceroom.mx';
const ADMIN_PASSWORD = 'Gkn7DCG7qUn00HHD';

const DUPLICATE_SILLA_WUNDA_ID = 'e89a4c78'; // se completará al consultar
const TARGET_CAPACITY = 6;

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

async function pool(tasks, concurrency = 6) {
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
    console.log('Login OK\n');

    // 1. Listar class types
    const ctRes = await req('/class-types', { token });
    const types = ctRes.data;
    console.log('Disciplinas:');
    types.forEach(t => console.log(`  ${t.name.padEnd(20)} | cap ${t.max_capacity} | ${t.id}`));

    // 2. Identificar Silla Wunda duplicado (el que tiene menos clases)
    const sillaWundas = types.filter(t => t.name === 'Silla Wunda' && t.is_active);
    if (sillaWundas.length !== 2) {
        console.log(`\nNo hay duplicado de Silla Wunda (encontrados: ${sillaWundas.length})`);
    } else {
        // Contar clases por class_type
        const today = new Date().toISOString().slice(0, 10);
        const classRes = await req(`/classes?start=2020-01-01&end=2030-12-31`, { token });
        const allClasses = Array.isArray(classRes.data) ? classRes.data : (classRes.data?.classes ?? []);

        const counts = {};
        allClasses.forEach(c => {
            counts[c.class_type_id] = (counts[c.class_type_id] || 0) + 1;
        });

        const sw1Count = counts[sillaWundas[0].id] || 0;
        const sw2Count = counts[sillaWundas[1].id] || 0;
        const duplicate = sw1Count < sw2Count ? sillaWundas[0] : sillaWundas[1];
        const original = sw1Count < sw2Count ? sillaWundas[1] : sillaWundas[0];

        console.log(`\nDuplicado: ${duplicate.id} (${counts[duplicate.id] || 0} clases)`);
        console.log(`Original:  ${original.id} (${counts[original.id] || 0} clases)`);

        // Reasignar las clases del duplicado al original
        const dupClasses = allClasses.filter(c => c.class_type_id === duplicate.id);
        console.log(`\nReasignando ${dupClasses.length} clases del duplicado al original...`);
        let ok = 0, fail = 0;
        await pool(dupClasses.map(cls => async () => {
            const r = await req(`/classes/${cls.id}`, {
                method: 'PUT',
                token,
                body: { classTypeId: original.id },
            });
            if (r.ok) ok++; else { fail++; console.log(`  FAIL ${cls.id}: ${JSON.stringify(r.data).slice(0,100)}`); }
        }), 6);
        console.log(`  Reasignadas: ${ok} OK, ${fail} errores`);

        // Desactivar el duplicado
        const del = await req(`/class-types/${duplicate.id}`, { method: 'DELETE', token });
        console.log(del.ok ? 'Duplicado desactivado ✓' : `Error al desactivar: ${JSON.stringify(del.data)}`);
    }

    // 3. Actualizar capacidad de todas las disciplinas activas a 6
    const refreshed = await req('/class-types', { token });
    const active = refreshed.data.filter(t => t.is_active);
    console.log(`\nActualizando capacidad a ${TARGET_CAPACITY} en ${active.length} disciplinas activas...`);
    for (const t of active) {
        if (t.max_capacity === TARGET_CAPACITY) {
            console.log(`  ${t.name.padEnd(20)} ya tiene ${TARGET_CAPACITY} (skip)`);
            continue;
        }
        const r = await req(`/class-types/${t.id}`, {
            method: 'PUT',
            token,
            body: { maxCapacity: TARGET_CAPACITY },
        });
        console.log(`  ${t.name.padEnd(20)} ${t.max_capacity} → ${TARGET_CAPACITY} ${r.ok ? '✓' : 'FAIL: ' + JSON.stringify(r.data).slice(0, 80)}`);
    }

    console.log('\nListo.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
