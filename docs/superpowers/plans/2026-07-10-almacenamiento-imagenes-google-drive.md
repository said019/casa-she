# Almacenamiento unificado de imágenes en Google Drive Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task.

**Goal:** Almacenar fotos de perfil, coaches, productos y comprobantes en Google Drive cuando esté configurado, con fallback base64 transparente.

**Architecture:** imageStorage.ts concentra validación, subida a Drive y fallback base64. Exporta subirImagen para imágenes y subirComprobante para imágenes o PDF. Las rutas solo persisten la URL resultante y la UI usa el concepto de comprobante, sin mostrar Google Drive.

**Tech Stack:** TypeScript, Express, Multer memoryStorage, PostgreSQL, Google Drive OAuth, React, TanStack Query.

## Global Constraints

- Google Drive usa las credenciales OAuth existentes y GOOGLE_DRIVE_FOLDER_ID; no se usan Cloudinary ni service accounts.
- Si Drive no está configurado o falla, toda subida usa fallback data-URL si cabe dentro del límite.
- subirImagen acepta solo MIME image/* y su fallback por defecto es 1 MiB.
- Perfil y coach conservan fallback de 2 MiB para no cambiar su comportamiento visible.
- Comprobantes conservan MIME image/* y application/pdf.
- La interfaz muestra solo comprobantes; nunca texto, enlaces expuestos ni branding de Google Drive.
- No migrar videos ni ejecutar la migración real contra producción en esta tarea.
- Conservar autenticación, ownership y validaciones de estado ya existentes.

---

### Task 1: Módulo imageStorage y pruebas

**Files:**
- Create: backend/src/lib/imageStorage.ts
- Create: backend/scripts/test-image-storage.ts
- Modify: backend/package.json
- Modify: backend/.env.example

**Interfaces:**
- Produces subirImagen(buffer, mimeType, nombreBase, opts): Promise<string>.
- Produces subirComprobante(buffer, mimeType, nombreBase, opts): Promise<string>.
- Produces createImageStorage(dependencies) to unit-test Drive success, fallback and failure.

- [ ] Step 1: Add failing unit cases for Drive image success, no-Drive fallback, Drive failure fallback, non-image rejection, fallback size rejection, and PDF receipt preview URL.
- [ ] Step 2: Run npx tsx scripts/test-image-storage.ts and confirm it fails because the module does not exist.
- [ ] Step 3: Implement createImageStorage with injectable configured/upload/url functions. On Drive success, images return driveImageUrl(fileId, thumbnail width default 1600); PDF receipts return the direct preview URL ending in /file/d/<id>/preview. On Drive error log a warning and return a data URL only under maxBase64Bytes.
- [ ] Step 4: Export production functions backed by googleDrive.ts. Add the four Drive variable names to .env.example without values and chain the script in backend npm test.
- [ ] Step 5: Run the focused test and backend TypeScript compiler, then commit only the files in this task.

### Task 2: Refactor profile and coach image routes

**Files:**
- Modify: backend/src/routes/users.ts
- Modify: backend/src/routes/instructors.ts
- Modify: backend/scripts/test-image-storage.ts

**Interfaces:**
- Consumes subirImagen from Task 1 with maxBase64Bytes equal to 2 MiB.
- Preserves response bodies, authorization and database columns.

- [ ] Step 1: Extend the storage test with a 1.5 MiB fallback assertion using the 2 MiB route option.
- [ ] Step 2: Remove direct googleDrive imports and duplicated Drive/base64 blocks from POST /api/users/:id/photo, POST /api/instructors/me/photo and POST /api/instructors/:id/photo.
- [ ] Step 3: Keep file presence and image MIME checks, call subirImagen with profile-<id> or instructor-<id> base names, and map oversize fallback errors to the existing 413/400 behavior.
- [ ] Step 4: Run npx tsc --noEmit and npx tsx scripts/test-image-storage.ts, then commit only the task files.

### Task 3: Product image endpoint and admin form

**Files:**
- Modify: backend/src/routes/products.ts
- Modify: frontend/src/pages/admin/pos/ProductsPage.tsx
- Modify: backend/scripts/test-image-storage.ts

**Interfaces:**
- Produces POST /api/products/:id/image with multipart field image.
- Consumes subirImagen and persists products.image_url.

- [ ] Step 1: Add a focused contract test for a valid product image update and rejection of missing or non-image uploads.
- [ ] Step 2: Add Multer memoryStorage with a 10 MiB request limit and the image endpoint guarded by authenticate and requirePermission('inventario'). Resolve the product facility scope before writing, update image_url and return the updated product.
- [ ] Step 3: Replace browser file-to-base64 conversion in ProductsPage with File state and object-URL preview cleanup. Create or update the product without a new image first, then POST FormData to the new endpoint if a file was selected. Preserve the existing image if no file is chosen.
- [ ] Step 4: Run backend TypeScript plus focused storage test, then frontend TypeScript and production build. Commit only the task files.

### Task 4: Store payment proofs without exposing Drive

**Files:**
- Modify: backend/src/routes/orders.ts
- Modify: frontend/src/pages/client/OrderDetail.tsx
- Modify: backend/scripts/test-image-storage.ts

**Interfaces:**
- Consumes subirComprobante from Task 1.
- Preserves JSON fields file_data, file_name, file_type, transfer reference/date and notes.

- [ ] Step 1: Add test cases that decode valid PNG and PDF data URLs and reject malformed data URLs, mismatched file_type and unsupported MIME.
- [ ] Step 2: In POST /api/orders/:id/upload-proof, validate/decode the data URL before opening the database transaction, call subirComprobante and use its result as payment_proofs.file_url. Preserve owner and pending state checks.
- [ ] Step 3: Reject missing/invalid proof with 400 and oversized fallback with 413. Continue to persist file name, MIME, reference and notes exactly as today.
- [ ] Step 4: Preserve image previews in OrderDetail. For PDF, render only an accessible button labelled Ver comprobante that opens the proof; do not render raw URLs or Google Drive copy.
- [ ] Step 5: Run backend and frontend compilers, focused tests and frontend build, then commit only the task files.

### Task 5: Idempotent migration and operational documentation

**Files:**
- Create: backend/scripts/migrate-images-to-drive.ts
- Modify: backend/README.md

**Interfaces:**
- Script accepts --dry-run and reports scanned, migrated, skipped and failed counters.
- Uses subirImagen for users/instructors and subirComprobante for payment proofs.

- [ ] Step 1: Select only data:image base64 rows from users.photo_url, instructors.photo_url and payment_proofs.file_url. Decode, upload, update exactly that row, continue after a row error and skip non-data URLs.
- [ ] Step 2: In --dry-run do not write or call the upload function; report each candidate and final counters.
- [ ] Step 3: Document the four Railway variables, public reader permission, UI abstraction of Drive, and the dry-run command followed by the real command.
- [ ] Step 4: Run npx tsc --noEmit, npx tsx scripts/migrate-images-to-drive.ts --dry-run, npm test, frontend npm run build and git diff --check. Do not run the real migration.
- [ ] Step 5: Commit only the migration script and README.
