import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool } from '../src/config/database.js';
import { createImageStorage, ImageStorageError } from '../src/lib/imageStorage.js';

const image = Buffer.from('small-image');
const PRODUCT_IMAGE_PORT = 3204;
const PRODUCT_IMAGE_API = `http://localhost:${PRODUCT_IMAGE_PORT}/api`;
const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productImage = Buffer.from('product-image');
const PRODUCT_IMAGE_MAX_TRANSPORT_BYTES = 10 * 1024 * 1024;

async function expectRejects(
    action: () => Promise<unknown>,
    expectedCode: ImageStorageError['code'],
): Promise<void> {
    await assert.rejects(action, (error: unknown) => {
        assert.ok(error instanceof ImageStorageError);
        assert.equal(error.code, expectedCode);
        return true;
    });
}

async function waitForHealth(timeoutMs = 90_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${PRODUCT_IMAGE_API}/health`);
            if (response.ok) return;
        } catch {
            // The server is still starting.
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('El servidor no respondió para el contrato de imagen de producto');
}

async function apiJson(url: string, token: string, body: FormData): Promise<{ status: number; json: any }> {
    const response = await fetch(`${PRODUCT_IMAGE_API}${url}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
    });
    return { status: response.status, json: await response.json() };
}

async function productImageContract(): Promise<void> {
    const server: ChildProcess = spawn('npx', ['tsx', 'src/index.ts'], {
        cwd: BACKEND_DIR,
        env: {
            ...process.env,
            PORT: String(PRODUCT_IMAGE_PORT),
            DISABLE_WHATSAPP: 'true',
            ENABLE_CRON_JOBS: 'false',
            GOOGLE_CLIENT_ID: '',
            GOOGLE_CLIENT_SECRET: '',
            GOOGLE_REFRESH_TOKEN: '',
            GOOGLE_DRIVE_FOLDER_ID: '',
        },
        stdio: 'ignore',
    });
    const createdUserIds: string[] = [];
    const createdProductIds: string[] = [];

    try {
        await waitForHealth();
        const suffix = Date.now();
        const facility = (await pool.query<{ id: string }>(
            'SELECT id FROM facilities WHERE is_active = true ORDER BY created_at LIMIT 1',
        )).rows[0];
        assert.ok(facility, 'se requiere una sucursal activa para el contrato de productos');

        const password = 'Product.Image.Test123!';
        const user = (await pool.query<{ id: string }>(
            `INSERT INTO users (email, phone, display_name, role, password_hash)
             VALUES ($1, $2, $3, 'admin', $4)
             RETURNING id`,
            [`product_image_${suffix}@test.local`, `556${suffix}`.slice(0, 12), 'Product Image Test', await bcrypt.hash(password, 10)],
        )).rows[0];
        createdUserIds.push(user.id);

        const product = (await pool.query<{ id: string }>(
            `INSERT INTO products (name, price, stock, facility_id)
             VALUES ($1, 1, 0, $2)
             RETURNING id`,
            [`Product Image ${suffix}`, facility.id],
        )).rows[0];
        createdProductIds.push(product.id);

        const loginResponse = await fetch(`${PRODUCT_IMAGE_API}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: `product_image_${suffix}@test.local`, password }),
        });
        const login = await loginResponse.json();
        assert.equal(loginResponse.status, 200, `login de contrato: ${JSON.stringify(login)}`);
        const token = login.token as string;
        assert.ok(token, 'login debe devolver token');

        const missing = await apiJson(`/products/${product.id}/image`, token, new FormData());
        assert.equal(missing.status, 400, `imagen faltante: ${JSON.stringify(missing.json)}`);

        const nonImageBody = new FormData();
        nonImageBody.append('image', new Blob([Buffer.from('no es imagen')], { type: 'text/plain' }), 'nota.txt');
        const nonImage = await apiJson(`/products/${product.id}/image`, token, nonImageBody);
        assert.equal(nonImage.status, 400, `archivo no imagen: ${JSON.stringify(nonImage.json)}`);

        const missingProductBody = new FormData();
        missingProductBody.append('image', new Blob([productImage], { type: 'image/png' }), 'producto.png');
        const missingProduct = await apiJson(`/products/${randomUUID()}/image`, token, missingProductBody);
        assert.equal(missingProduct.status, 404, `producto inexistente: ${JSON.stringify(missingProduct.json)}`);

        // El archivo queda justo en 10 MiB; el framing multipart lo hace exceder el
        // presupuesto de transporte total. Debe rechazarlo ANTES de intentar el fallback local.
        const aggregateLimitBody = new FormData();
        aggregateLimitBody.append(
            'image',
            new Blob([Buffer.alloc(PRODUCT_IMAGE_MAX_TRANSPORT_BYTES)], { type: 'image/png' }),
            'limite-transporte.png',
        );
        const aggregateLimit = await apiJson(`/products/${product.id}/image`, token, aggregateLimitBody);
        assert.equal(aggregateLimit.status, 413, `límite total multipart: ${JSON.stringify(aggregateLimit.json)}`);
        assert.match(aggregateLimit.json.error, /carga multipart.*10 MB/i);

        const validBody = new FormData();
        validBody.append('image', new Blob([productImage], { type: 'image/png' }), 'producto.png');
        const valid = await apiJson(`/products/${product.id}/image`, token, validBody);
        assert.equal(valid.status, 200, `imagen válida: ${JSON.stringify(valid.json)}`);
        assert.equal(valid.json.image_url, `data:image/png;base64,${productImage.toString('base64')}`);

        const persisted = (await pool.query<{ image_url: string }>(
            'SELECT image_url FROM products WHERE id = $1', [product.id],
        )).rows[0];
        assert.equal(persisted.image_url, valid.json.image_url, 'la URL de la imagen debe persistirse');
    } finally {
        if (createdProductIds.length) {
            await pool.query('DELETE FROM products WHERE id = ANY($1)', [createdProductIds]);
        }
        if (createdUserIds.length) {
            await pool.query('DELETE FROM users WHERE id = ANY($1)', [createdUserIds]);
        }
        server.kill('SIGTERM');
    }
}

async function main(): Promise<void> {
    let uploadedName = '';
    let uploadedMime = '';
    let uploadedBuffer: Buffer | undefined;
    let requestedWidth = 0;
    const driveStorage = createImageStorage({
        configured: () => true,
        upload: async (buffer, originalName, mimeType) => {
            uploadedBuffer = buffer;
            uploadedName = originalName;
            uploadedMime = mimeType;
            return { fileId: 'drive-image-123' };
        },
        imageUrl: (fileId, width) => {
            requestedWidth = width;
            return `https://images.example/${fileId}?width=${width}`;
        },
    });

    const driveImage = await driveStorage.subirImagen(image, 'image/png', 'perfil-ana');
    assert.equal(driveImage, 'https://images.example/drive-image-123?width=1600');
    assert.equal(uploadedBuffer, image);
    assert.equal(uploadedName, 'perfil-ana.png');
    assert.equal(uploadedMime, 'image/png');
    assert.equal(requestedWidth, 1600);

    const noDriveStorage = createImageStorage({
        configured: () => false,
        upload: async () => {
            throw new Error('no debe intentar subir sin Drive');
        },
        imageUrl: () => 'no-usado',
    });
    const fallbackImage = await noDriveStorage.subirImagen(image, 'image/jpeg', 'perfil-ana');
    assert.equal(fallbackImage, `data:image/jpeg;base64,${image.toString('base64')}`);

    const oneAndHalfMiBImage = Buffer.alloc(Math.floor(1.5 * 1024 * 1024), 0xab);
    const routeFallbackImage = await noDriveStorage.subirImagen(
        oneAndHalfMiBImage,
        'image/jpeg',
        'perfil-ana',
        { maxBase64Bytes: 2 * 1024 * 1024 },
    );
    assert.equal(routeFallbackImage, `data:image/jpeg;base64,${oneAndHalfMiBImage.toString('base64')}`);

    const warnings: unknown[][] = [];
    const driveFailureStorage = createImageStorage({
        configured: () => true,
        upload: async () => {
            throw new Error('Drive no disponible');
        },
        imageUrl: () => 'no-usado',
        warn: (...args) => warnings.push(args),
    });
    const failedDriveFallback = await driveFailureStorage.subirImagen(image, 'image/webp', 'producto');
    assert.equal(failedDriveFallback, `data:image/webp;base64,${image.toString('base64')}`);
    assert.equal(warnings.length, 1);

    await expectRejects(
        () => noDriveStorage.subirImagen(image, 'application/pdf', 'no-es-imagen'),
        'INVALID_MIME_TYPE',
    );

    await expectRejects(
        () => noDriveStorage.subirImagen(
            Buffer.alloc(1 * 1024 * 1024 + 1),
            'image/png',
            'demasiado-grande',
        ),
        'BASE64_TOO_LARGE',
    );

    const pdfStorage = createImageStorage({
        configured: () => true,
        upload: async () => ({ fileId: 'receipt-pdf-456' }),
        imageUrl: () => 'no-usado-para-pdf',
    });
    const pdfPreview = await pdfStorage.subirComprobante(
        Buffer.from('%PDF-1.7'),
        'application/pdf',
        'comprobante-julio',
    );
    assert.equal(pdfPreview, 'https://drive.google.com/file/d/receipt-pdf-456/preview');

    await productImageContract();

    await pool.end();

    console.log('test-image-storage: OK');
}

main().catch((error: unknown) => {
    console.error('test-image-storage: FAIL');
    console.error(error);
    void pool.end();
    process.exitCode = 1;
});
