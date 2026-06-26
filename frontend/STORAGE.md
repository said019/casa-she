# Almacenamiento de archivos — Balance Room

## Fotos de perfil de usuarios

**Endpoint:** `POST /api/users/:id/photo`  
**Middleware:** `multer.memoryStorage()` (límite 10 MB)  
**Campo de BD:** `users.photo_url` (TEXT)

### Flujo de subida

```
Cliente envía multipart/form-data (campo "photo")
        │
        ▼
Backend recibe buffer en memoria (multer)
        │
        ├─ ¿GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN configurados?
        │         YES → sube a Google Drive como imagen pública
        │               URL resultante: https://drive.google.com/thumbnail?id=<fileId>&sz=w512
        │               guardada en users.photo_url
        │
        └─ NO (fallback) → convierte a base64 data-URI (máx 2 MB)
                          data:<mimetype>;base64,<bytes>
                          guardada directamente en users.photo_url
```

### Env vars necesarias (foto de perfil)

| Variable | Descripción |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 client secret |
| `GOOGLE_REFRESH_TOKEN` | Refresh token con scope `drive.file` |
| `GOOGLE_DRIVE_FOLDER_ID` | (opcional) carpeta destino en Drive |

Sin estas vars, las fotos se guardan como base64 en la columna. Límite estricto: 2 MB en modo fallback.

### Leer la foto

La URL en `users.photo_url` se lee directamente en el frontend:

```tsx
<AvatarImage src={user.photo_url || undefined} />
```

Si es Google Drive, el navegador carga la imagen directamente (archivo público).  
Si es base64, el navegador la decodifica inline.

---

## Videos de la biblioteca

**Endpoint:** `POST /api/videos/upload`  
**Middleware:** `multer.memoryStorage()` (límite 600 MB)  
**Campos:** `video` (video) + `thumbnail` (imagen, opcional)

### Flujo de subida

```
Admin envía multipart/form-data
        │
        ├─ ¿CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET?
        │         YES → Cloudinary (autenticado)
        │               public_id: balance-room/videos/<slug>-<timestamp>
        │               type: 'authenticated'  ← URL no es pública, requiere firma
        │               thumbnail: balance-room/thumbnails/<slug>-<timestamp>
        │               retorna cloudinary_id + thumbnail_url + duration_seconds
        │
        └─ NO → Google Drive
                    sube video con OAuth (mismas vars de la foto)
                    hace el archivo público (role: reader, type: anyone)
                    retorna fileId como drive_file_id
                    thumbnail: Drive thumbnail link (sz=w640)
```

### Reproducción de video (Cloudinary)

Los videos en Cloudinary son `type: authenticated` — la URL no es pública.  
Para reproducirlos se genera una URL firmada con TTL:

```
GET /api/videos/:slug/stream
```

El backend llama `generateSignedVideoUrl(public_id, 120)` que produce:

```
https://res.cloudinary.com/<cloud>/video/authenticated/s--<signature>--/
    balance-room/videos/<slug>.m3u8   (HLS adaptativo)
```

La URL expira en 120 minutos. El cliente la usa para el reproductor (HLS.js / `<video>`).

### Miniaturas (Cloudinary)

Si no se sube thumbnail manualmente, se auto-genera a partir del frame a los 10s del video:

```ts
cloudinary.url(publicId, {
    resource_type: 'video',
    format: 'jpg',
    transformation: [
        { width: 640, height: 360, crop: 'fill' },
        { quality: 'auto' },
        { start_offset: '10' }
    ]
});
```

### Env vars necesarias (videos)

| Variable | Descripción |
|---|---|
| `CLOUDINARY_CLOUD_NAME` | Nombre del cloud en Cloudinary |
| `CLOUDINARY_API_KEY` | API key |
| `CLOUDINARY_API_SECRET` | API secret (firmado de URLs) |

Sin Cloudinary, los videos caen al fallback de Google Drive (mismas vars que fotos de perfil).

---

## Resumen rápido

| Recurso | Almacén principal | Fallback | Acceso |
|---|---|---|---|
| Foto de perfil | Google Drive (thumbnail URL) | base64 en PostgreSQL | URL pública directa |
| Video | Cloudinary authenticated | Google Drive (público) | URL firmada (2h TTL) |
| Miniatura video | Cloudinary auto-transform | Drive thumbnail link | URL pública |

---

## Archivos clave

- [`Balance Room/server/src/lib/cloudinary.ts`](Balance Room/server/src/lib/cloudinary.ts) — configuración Cloudinary, `generateSignedVideoUrl`, `generateThumbnailUrl`
- [`Balance Room/server/src/lib/googleDrive.ts`](Balance Room/server/src/lib/googleDrive.ts) — OAuth flow, `uploadBufferToGoogleDrive`, `driveImageUrl`
- [`Balance Room/server/src/routes/users.ts`](Balance Room/server/src/routes/users.ts) — endpoint `POST /api/users/:id/photo`
- [`Balance Room/server/src/routes/videos.ts`](Balance Room/server/src/routes/videos.ts) — endpoints upload, stream, CRUD de videos
