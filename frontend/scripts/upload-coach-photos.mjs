#!/usr/bin/env node
// Sube fotos de coaches a producción usando POST /api/instructors/:id/photo
// Uso:  ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/upload-coach-photos.mjs

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const API = process.env.API_BASE_URL || 'https://balance-room-api-production.up.railway.app/api';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('Faltan ADMIN_EMAIL y/o ADMIN_PASSWORD');
    process.exit(1);
}

const PHOTOS_DIR = '/Users/saidromero/Balance Room';

// instructorId -> archivo de foto
const MAPPING = [
    { name: 'Ari',          id: 'b6f6891e-d67d-45c9-a2a5-3ae8ed63a101', file: 'Ari.JPG' },
    { name: 'Car',          id: '00287f59-c132-4e2d-9fdd-71a84632d3fc', file: 'Car.JPG' },
    { name: 'Dani Salgado', id: 'a243ac8f-5501-40ac-b5b2-d1c1ae87a50c', file: 'Dani salgado.JPG' },
    { name: 'Danii D',      id: 'c8f6e33c-0cbf-4f88-8a31-25958680844b', file: 'Danii D.JPG' },
    { name: 'Fati',         id: 'ced371a9-5178-4ecd-a19c-1d20fa4eccad', file: 'Fati.JPG' },
    { name: 'Lucy Guillén', id: 'de77cf31-b765-4228-acc6-1014e0e7bb67', file: 'Lucy Guillén.JPG' },
    { name: 'Pam',          id: 'f0384f54-d6c8-4203-8f35-c50fac77a261', file: 'Pam.JPG' },
];

async function login() {
    const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Login falló: ${res.status} ${JSON.stringify(data)}`);
    return data.token;
}

// Resize JPEG using built-in macOS sips: max 700x875 to mirror admin UI processing.
// API guarda base64 en DB (sin Drive) con límite 2MB → debemos comprimir antes.
function resizeWithSips(srcPath) {
    const tmp = path.join(os.tmpdir(), `coach-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
    fs.copyFileSync(srcPath, tmp);
    // -Z fits image into a max bounding box preserving aspect ratio
    execFileSync('sips', ['-Z', '1200', '-s', 'format', 'jpeg', '-s', 'formatOptions', '92', tmp], { stdio: 'ignore' });
    return tmp;
}

async function uploadPhoto(token, { name, id, file }) {
    const fullPath = path.join(PHOTOS_DIR, file);
    if (!fs.existsSync(fullPath)) {
        console.log(`  [skip] ${name}: archivo no existe (${fullPath})`);
        return;
    }

    const resizedPath = resizeWithSips(fullPath);
    const buffer = fs.readFileSync(resizedPath);
    fs.unlinkSync(resizedPath);
    const sizeKb = (buffer.length / 1024).toFixed(0);
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    const form = new FormData();
    form.append('photo', blob, file);

    const res = await fetch(`${API}/instructors/${id}/photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }

    if (!res.ok) {
        console.log(`  [FAIL] ${name} (${sizeKb}KB): ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
    } else {
        const url = data.photo_url || '';
        console.log(`  [ok]   ${name} (${sizeKb}KB): ${url.slice(0, 60)}${url.length > 60 ? '...' : ''}`);
    }
}

async function main() {
    console.log(`API: ${API}`);
    console.log(`Login como ${ADMIN_EMAIL}...`);
    const token = await login();
    console.log(`Token OK. Subiendo ${MAPPING.length} fotos...\n`);

    for (const item of MAPPING) {
        await uploadPhoto(token, item);
    }

    console.log('\nListo.');
}

main().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
});
