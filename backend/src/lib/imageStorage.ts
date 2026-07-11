import {
    driveImageUrl,
    isGoogleDriveConfigured,
    uploadBufferToGoogleDrive,
} from './googleDrive.js';

const DEFAULT_MAX_BASE64_BYTES = 1 * 1024 * 1024;
const DEFAULT_THUMBNAIL_WIDTH = 1600;

export type ImageStorageErrorCode = 'INVALID_MIME_TYPE' | 'BASE64_TOO_LARGE';

export class ImageStorageError extends Error {
    constructor(
        public readonly code: ImageStorageErrorCode,
        message: string,
    ) {
        super(message);
        this.name = 'ImageStorageError';
    }
}

export interface ImageStorageOptions {
    maxBase64Bytes?: number;
    thumbnailWidth?: number;
}

export interface ImageStorageDependencies {
    configured: () => boolean;
    upload: (buffer: Buffer, originalName: string, mimeType: string) => Promise<{ fileId: string }>;
    imageUrl: (fileId: string, width?: number) => string;
    warn?: (message: string, error: unknown) => void;
}

export interface ImageStorage {
    subirImagen(
        buffer: Buffer,
        mimeType: string,
        nombreBase: string,
        opts?: ImageStorageOptions,
    ): Promise<string>;
    subirComprobante(
        buffer: Buffer,
        mimeType: string,
        nombreBase: string,
        opts?: ImageStorageOptions,
    ): Promise<string>;
}

function normalizedMimeType(mimeType: string): string {
    return mimeType.trim().toLowerCase();
}

function isImageMimeType(mimeType: string): boolean {
    return /^image\/[a-z0-9!#$&^_.+-]+$/i.test(mimeType);
}

function extensionForMimeType(mimeType: string): string | null {
    const extensions: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/avif': 'avif',
        'image/svg+xml': 'svg',
        'image/heic': 'heic',
        'application/pdf': 'pdf',
    };

    return extensions[mimeType] || null;
}

function originalName(nombreBase: string, mimeType: string): string {
    const base = nombreBase.trim() || 'archivo';
    if (/\.[a-z0-9]{1,10}$/i.test(base)) return base;

    const extension = extensionForMimeType(mimeType);
    return extension ? `${base}.${extension}` : base;
}

function dataUrl(buffer: Buffer, mimeType: string, maxBase64Bytes: number): string {
    if (buffer.length > maxBase64Bytes) {
        throw new ImageStorageError(
            'BASE64_TOO_LARGE',
            `El archivo excede el límite de ${maxBase64Bytes} bytes para almacenamiento local`,
        );
    }

    return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function assertAllowedMimeType(mimeType: string, allowPdf: boolean): void {
    const isAllowed = isImageMimeType(mimeType) || (allowPdf && mimeType === 'application/pdf');
    if (!isAllowed) {
        const accepted = allowPdf ? 'una imagen o PDF' : 'una imagen';
        throw new ImageStorageError('INVALID_MIME_TYPE', `El archivo debe ser ${accepted}`);
    }
}

function drivePreviewUrl(fileId: string): string {
    return `https://drive.google.com/file/d/${fileId}/preview`;
}

export function createImageStorage(dependencies: ImageStorageDependencies): ImageStorage {
    const warn = dependencies.warn || console.warn;

    async function store(
        buffer: Buffer,
        suppliedMimeType: string,
        nombreBase: string,
        opts: ImageStorageOptions | undefined,
        allowPdf: boolean,
    ): Promise<string> {
        const mimeType = normalizedMimeType(suppliedMimeType);
        assertAllowedMimeType(mimeType, allowPdf);

        if (dependencies.configured()) {
            try {
                const uploaded = await dependencies.upload(buffer, originalName(nombreBase, mimeType), mimeType);
                if (mimeType === 'application/pdf') {
                    return drivePreviewUrl(uploaded.fileId);
                }
                return dependencies.imageUrl(uploaded.fileId, opts?.thumbnailWidth ?? DEFAULT_THUMBNAIL_WIDTH);
            } catch (error) {
                warn('[imageStorage] Drive upload failed; using base64 fallback:', error);
            }
        }

        return dataUrl(buffer, mimeType, opts?.maxBase64Bytes ?? DEFAULT_MAX_BASE64_BYTES);
    }

    return {
        subirImagen: (buffer, mimeType, nombreBase, opts) => store(buffer, mimeType, nombreBase, opts, false),
        subirComprobante: (buffer, mimeType, nombreBase, opts) => store(buffer, mimeType, nombreBase, opts, true),
    };
}

const productionStorage = createImageStorage({
    configured: () => isGoogleDriveConfigured,
    upload: uploadBufferToGoogleDrive,
    imageUrl: driveImageUrl,
});

export const subirImagen = productionStorage.subirImagen;
export const subirComprobante = productionStorage.subirComprobante;
