import { subirImagen } from './imageStorage.js';
// Only explicit public image fields call this helper. Private files are not inputs.
export async function publicPhoto(value: any): Promise<any> {
    if (typeof value !== 'string' || !value.startsWith('data:')) return value;
    const match = /^data:(image\/(?:jpeg|png|webp|gif|avif));base64,([A-Za-z0-9+/=\s]+)$/.exec(value);
    if (!match) throw new Error('Invalid public raster photo');
    const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
    if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw new Error('Public photo exceeds 10 MB');
    return subirImagen(buffer, match[1], 'public-photo');
}
export async function publicPhotoFields<T extends Record<string, any>>(data: T, fields: string[]): Promise<T> {
    for (const field of fields) if (Object.prototype.hasOwnProperty.call(data, field)) (data as Record<string, any>)[field] = await publicPhoto(data[field]);
    return data;
}
