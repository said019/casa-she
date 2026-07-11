import assert from 'node:assert/strict';
import { createImageStorage, ImageStorageError } from '../src/lib/imageStorage.js';

const image = Buffer.from('small-image');

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

    console.log('test-image-storage: OK');
}

main().catch((error: unknown) => {
    console.error('test-image-storage: FAIL');
    console.error(error);
    process.exitCode = 1;
});
