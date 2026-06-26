import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
});

export const generateSignedVideoUrl = (publicId: string, expiresInMinutes = 120) => {
    const expiresAt = Math.floor(Date.now() / 1000) + (expiresInMinutes * 60);

    return cloudinary.url(publicId, {
        resource_type: 'video',
        type: 'authenticated', // Requires signed URL
        sign_url: true,
        expires_at: expiresAt,
        streaming_profile: 'auto', // HLS/DASH adaptive streaming
    });
};

export const generateThumbnailUrl = (publicId: string) => {
    return cloudinary.url(publicId, {
        resource_type: 'video',
        format: 'jpg',
        transformation: [
            { width: 640, height: 360, crop: 'fill' },
            { quality: 'auto' },
            { start_offset: '10' } // Frame at 10s
        ]
    });
};

export default cloudinary;
