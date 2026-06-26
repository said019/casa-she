import path from 'path';

export const isGoogleDriveConfigured = Boolean(
    process.env.GOOGLE_CLIENT_ID
    && process.env.GOOGLE_CLIENT_SECRET
    && process.env.GOOGLE_REFRESH_TOKEN
);

function toSlug(value: string): string {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
}

export async function getGoogleDriveAccessToken(): Promise<string> {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim();

    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error('Google Drive credentials are not configured');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
        }).toString(),
    });

    const rawText = await response.text();
    let data: { access_token?: string; error?: string; error_description?: string } = {};
    try {
        data = JSON.parse(rawText);
    } catch {
        /* response wasn't JSON */
    }

    if (!response.ok || !data.access_token) {
        const detail = data.error_description || data.error || rawText.slice(0, 300) || response.statusText;
        console.error('[Google OAuth] refresh failed', {
            status: response.status,
            body: rawText.slice(0, 500),
            clientIdPrefix: clientId.slice(0, 12),
            refreshTokenLen: refreshToken.length,
        });
        throw new Error(`Google OAuth error (${response.status}): ${detail}`);
    }

    return data.access_token;
}

export async function makeGoogleDriveFilePublic(fileId: string, accessToken: string): Promise<void> {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });

    if (!response.ok) {
        const text = await response.text();
        console.warn('Unable to make Google Drive file public:', text);
    }
}

export interface DriveUploadResult {
    fileId: string;
    webViewLink: string;
    thumbnailUrl: string | null;
    durationSeconds: number;
}

export async function uploadBufferToGoogleDrive(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    folderId?: string | null,
): Promise<DriveUploadResult> {
    const accessToken = await getGoogleDriveAccessToken();
    const ext = path.extname(originalName) || '';
    const baseName = toSlug(path.parse(originalName).name || 'file') || 'file';
    const fileName = `${baseName}-${Date.now()}${ext}`;

    const metadata: { name: string; parents?: string[] } = { name: fileName };
    const parentFolderId = folderId || process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (parentFolderId) metadata.parents = [parentFolderId];

    const boundary = `catarsis_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const metadataPart = Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`
    );
    const fileHeaderPart = Buffer.from(
        `--${boundary}\r\nContent-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`
    );
    const endPart = Buffer.from(`\r\n--${boundary}--`);
    const body = Buffer.concat([metadataPart, fileHeaderPart, buffer, endPart]);

    const uploadResponse = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,thumbnailLink,videoMediaMetadata',
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body,
        }
    );

    const uploadData = await uploadResponse.json() as {
        id?: string;
        webViewLink?: string;
        thumbnailLink?: string;
        videoMediaMetadata?: { durationMillis?: string };
        error?: { message?: string };
    };

    if (!uploadResponse.ok || !uploadData.id) {
        throw new Error(`Google Drive upload error: ${uploadData.error?.message || uploadResponse.statusText}`);
    }

    await makeGoogleDriveFilePublic(uploadData.id, accessToken);

    const durationMillis = Number(uploadData.videoMediaMetadata?.durationMillis || 0);

    return {
        fileId: uploadData.id,
        webViewLink: uploadData.webViewLink || `https://drive.google.com/file/d/${uploadData.id}/view`,
        thumbnailUrl: uploadData.thumbnailLink || `https://drive.google.com/thumbnail?id=${uploadData.id}&sz=w640`,
        durationSeconds: Number.isFinite(durationMillis) && durationMillis > 0 ? Math.round(durationMillis / 1000) : 0,
    };
}

export function driveImageUrl(fileId: string, width = 512): string {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`;
}
