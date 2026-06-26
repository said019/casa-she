#!/usr/bin/env node
// Crea a Yami Mustre como instructora y sube su foto.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const API = 'https://balance-room-api-production.up.railway.app/api';
const ADMIN_EMAIL = 'admin@balanceroom.mx';
const ADMIN_PASSWORD = 'Gkn7DCG7qUn00HHD';
const PHOTO_PATH = '/Users/saidromero/Balance Room/Yami Mustre.JPG';

async function req(path_, { method = 'GET', token, body, form } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${API}${path_}`, {
        method,
        headers,
        body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { ok: res.ok, status: res.status, data };
}

function resizeWithSips(srcPath) {
    const tmp = path.join(os.tmpdir(), `yami-${Date.now()}.jpg`);
    fs.copyFileSync(srcPath, tmp);
    execFileSync('sips', ['-Z', '1200', '-s', 'format', 'jpeg', '-s', 'formatOptions', '92', tmp], { stdio: 'ignore' });
    return tmp;
}

async function main() {
    // 1. Login
    const login = await req('/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    if (!login.ok) throw new Error('Login falló: ' + JSON.stringify(login.data));
    const token = login.data.token;
    console.log('Login OK');

    // 2. Crear instructora
    const create = await req('/instructors', {
        method: 'POST',
        token,
        body: {
            email: 'yami@balanceroom.mx',
            displayName: 'Yami Mustre',
            isActive: true,
            visiblePublic: true,
        },
    });

    let instructorId;
    if (!create.ok) {
        if (create.data?.error?.includes('ya es instructor') || create.status === 400) {
            // Puede que ya exista — buscarla
            const list = await req('/instructors', { token });
            const found = list.data?.find?.(i => i.display_name === 'Yami Mustre');
            if (found) {
                instructorId = found.id;
                console.log(`Yami Mustre ya existía (id: ${instructorId})`);
            } else {
                throw new Error('Crear falló: ' + JSON.stringify(create.data));
            }
        } else {
            throw new Error('Crear falló: ' + JSON.stringify(create.data));
        }
    } else {
        instructorId = create.data.id;
        console.log(`Yami Mustre creada (id: ${instructorId})`);
        if (create.data.credentials) {
            console.log('Credenciales:', JSON.stringify(create.data.credentials));
        }
    }

    // 3. Subir foto
    const resized = resizeWithSips(PHOTO_PATH);
    const buffer = fs.readFileSync(resized);
    fs.unlinkSync(resized);
    console.log(`Foto redimensionada: ${(buffer.length / 1024).toFixed(0)}KB`);

    const blob = new Blob([buffer], { type: 'image/jpeg' });
    const form = new FormData();
    form.append('photo', blob, 'yami.jpg');

    const photo = await req(`/instructors/${instructorId}/photo`, { method: 'POST', token, form });
    if (!photo.ok) throw new Error('Foto falló: ' + JSON.stringify(photo.data));
    console.log('Foto OK');
    console.log('Listo. ✓');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
