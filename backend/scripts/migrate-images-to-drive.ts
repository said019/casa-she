import 'dotenv/config';

import { subirComprobante, subirImagen } from '../src/lib/imageStorage.js';

type MigrationTarget = {
    table: 'users' | 'instructors' | 'payment_proofs';
    column: 'photo_url' | 'file_url';
    label: string;
    upload: typeof subirImagen | typeof subirComprobante;
    fileName: (id: string) => string;
};

type Candidate = {
    id: string;
    sourceUrl: string;
};

type Counters = {
    scanned: number;
    migrated: number;
    skipped: number;
    failed: number;
};

const IMAGE_BASE64_PREFIX = '^data:image/[a-z0-9!#$&^_.+-]+;base64,';
const IMAGE_BASE64_DATA_URL = /^data:(image\/[a-z0-9!#$&^_.+-]+);base64,([a-z0-9+/]*={0,2})$/i;
const REQUIRED_GOOGLE_DRIVE_VARIABLES = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REFRESH_TOKEN',
    'GOOGLE_DRIVE_FOLDER_ID',
] as const;

const targets: MigrationTarget[] = [
    {
        table: 'users',
        column: 'photo_url',
        label: 'user profile',
        upload: subirImagen,
        fileName: (id) => `profile-${id}`,
    },
    {
        table: 'instructors',
        column: 'photo_url',
        label: 'instructor profile',
        upload: subirImagen,
        fileName: (id) => `instructor-${id}`,
    },
    {
        table: 'payment_proofs',
        column: 'file_url',
        label: 'payment proof',
        upload: subirComprobante,
        fileName: (id) => `comprobante-${id}`,
    },
];

function parseArgs(): { dryRun: boolean } {
    const args = process.argv.slice(2);
    const unknownArgs = args.filter((arg) => arg !== '--dry-run');
    if (unknownArgs.length > 0) {
        throw new Error(`Uso: npx tsx scripts/migrate-images-to-drive.ts [--dry-run] (argumentos inválidos: ${unknownArgs.join(', ')})`);
    }

    return { dryRun: args.includes('--dry-run') };
}

function decodeImageDataUrl(value: string): { buffer: Buffer; mimeType: string } {
    const match = IMAGE_BASE64_DATA_URL.exec(value);
    if (!match) {
        throw new Error('La URL ya no es una data:image base64 válida');
    }

    const [, mimeType, encoded] = match;
    if (encoded.length === 0 || encoded.length % 4 !== 0) {
        throw new Error('El contenido base64 de la imagen no es válido');
    }

    const buffer = Buffer.from(encoded, 'base64');
    if (buffer.length === 0 || buffer.toString('base64') !== encoded) {
        throw new Error('El contenido base64 de la imagen no es válido');
    }

    return { buffer, mimeType: mimeType.toLowerCase() };
}

function isGoogleDriveUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && url.hostname === 'drive.google.com';
    } catch {
        return false;
    }
}

function printSummary(counters: Counters, dryRun: boolean): void {
    console.log(`\nMigration summary${dryRun ? ' (dry run)' : ''}:`);
    console.log(`  scanned: ${counters.scanned}`);
    console.log(`  migrated: ${counters.migrated}`);
    console.log(`  skipped: ${counters.skipped}`);
    console.log(`  failed: ${counters.failed}`);
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function missingGoogleDriveVariables(): string[] {
    return REQUIRED_GOOGLE_DRIVE_VARIABLES.filter((name) => !process.env[name]?.trim());
}

async function main(): Promise<void> {
    const { dryRun } = parseArgs();
    const counters: Counters = { scanned: 0, migrated: 0, skipped: 0, failed: 0 };

    // subirImagen/subirComprobante intentionally fall back to data URLs for
    // regular request handling. A migration must never do that: it is only safe
    // to start a real run when all Drive settings are non-empty.
    const missingDriveVariables = missingGoogleDriveVariables();
    if (!dryRun && missingDriveVariables.length > 0) {
        console.error('Google Drive is not configured. Refusing to start the real migration.');
        console.error(`Set non-empty values for: ${missingDriveVariables.join(', ')}, then retry.`);
        printSummary(counters, dryRun);
        process.exitCode = 1;
        return;
    }

    // Keep the configuration check above database initialization so an
    // accidentally invoked real migration never opens a DB connection first.
    const { pool } = await import('../src/config/database.js');

    try {
        for (const target of targets) {
            // This server-side filter deliberately excludes ordinary URLs and
            // non-image data URLs. The decoder remains a second guard against
            // malformed base64 values.
            let candidates: Candidate[];
            try {
                const result = await pool.query<Candidate>(
                    `SELECT id, ${target.column} AS "sourceUrl"
                     FROM ${target.table}
                     WHERE ${target.column} ~* $1`,
                    [IMAGE_BASE64_PREFIX],
                );
                candidates = result.rows;
            } catch (error) {
                counters.failed += 1;
                console.error(`[failed] scanning ${target.table}.${target.column}: ${errorMessage(error)}`);
                continue;
            }

            for (const candidate of candidates) {
                counters.scanned += 1;

                try {
                    if (dryRun) {
                        const { buffer, mimeType } = decodeImageDataUrl(candidate.sourceUrl);
                        counters.skipped += 1;
                        console.log(
                            `[dry-run] Would migrate ${target.label} ${candidate.id} (${mimeType}, ${buffer.length} bytes)`,
                        );
                        continue;
                    }

                    const client = await pool.connect();
                    try {
                        await client.query('BEGIN');

                        // Lock and recheck before calling Drive. The lock stays
                        // open through the upload and update, so a concurrent
                        // request cannot make this upload orphaned by changing
                        // the source URL in the meantime.
                        const locked = await client.query<Candidate>(
                            `SELECT ${target.column} AS "sourceUrl"
                             FROM ${target.table}
                             WHERE id = $1
                             FOR UPDATE`,
                            [candidate.id],
                        );
                        const lockedSourceUrl = locked.rows[0]?.sourceUrl;
                        if (lockedSourceUrl !== candidate.sourceUrl) {
                            await client.query('COMMIT');
                            counters.skipped += 1;
                            console.warn(
                                `[skipped] ${target.label} ${candidate.id} changed before it could be locked; no upload was attempted`,
                            );
                            continue;
                        }

                        const { buffer, mimeType } = decodeImageDataUrl(lockedSourceUrl);
                        const destinationUrl = await target.upload(buffer, mimeType, target.fileName(candidate.id));
                        if (!isGoogleDriveUrl(destinationUrl)) {
                            throw new Error('Drive upload did not return a Google Drive URL; database row was left unchanged');
                        }

                        const update = await client.query(
                            `UPDATE ${target.table}
                             SET ${target.column} = $1, updated_at = NOW()
                             WHERE id = $2 AND ${target.column} = $3`,
                            [destinationUrl, candidate.id, candidate.sourceUrl],
                        );

                        if (update.rowCount !== 1) {
                            throw new Error('The locked row could not be updated; database transaction was rolled back');
                        }

                        await client.query('COMMIT');
                        counters.migrated += 1;
                        console.log(`[migrated] ${target.label} ${candidate.id}`);
                    } catch (error) {
                        await client.query('ROLLBACK').catch((rollbackError: unknown) => {
                            console.error(`[failed] rollback for ${target.label} ${candidate.id}: ${errorMessage(rollbackError)}`);
                        });
                        throw error;
                    } finally {
                        client.release();
                    }
                } catch (error) {
                    counters.failed += 1;
                    console.error(`[failed] ${target.label} ${candidate.id}: ${errorMessage(error)}`);
                }
            }
        }
    } finally {
        await pool.end();
    }

    printSummary(counters, dryRun);
    if (counters.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
    console.error(`Image migration could not complete: ${errorMessage(error)}`);
    process.exitCode = 1;
});
