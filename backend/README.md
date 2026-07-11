# Backend

## Google Drive image storage

The backend stores profile photos, instructor photos, product images and payment
proofs through the image-storage abstraction. Google Drive is an implementation
detail: the client UI continues to show an image preview or a **Ver comprobante**
action and must not expose Drive URLs, branding or storage-specific copy.

Configure these four variables in the Railway backend service:

- `GOOGLE_CLIENT_ID` — OAuth client ID.
- `GOOGLE_CLIENT_SECRET` — OAuth client secret.
- `GOOGLE_REFRESH_TOKEN` — refresh token for the Drive account.
- `GOOGLE_DRIVE_FOLDER_ID` — destination folder ID.

All four must contain non-empty values before the real image-migration command
will start.

Regular rendered images are uploaded with the Google Drive public-reader
permission (`type=anyone`, `role=reader`) so the application can render them.
Payment proofs explicitly remain private: their bytes are served only through
the authenticated, same-origin payment-proof endpoint after the backend checks
that the requester owns the order or is an authorized reviewer. Check that your
Google Workspace sharing policy allows the public-reader permission before
enabling regular image uploads in production.

### Migrating existing base64 images

The migration considers only `data:image/...;base64,...` values in
`users.photo_url`, `instructors.photo_url` and `payment_proofs.file_url`. It is
idempotent: after a successful upload, the exact source row is replaced by its
Google Drive URL, so later runs do not select it again. It never migrates videos
or other URL formats.

Run the local dry run first. It reads candidate rows and reports each one, but it
does not call Google Drive or write to the database:

```bash
cd backend
npx tsx scripts/migrate-images-to-drive.ts --dry-run
```

Only after reviewing that output and confirming all four Drive variables are set,
run the real migration in the intended environment:

```bash
cd backend
npx tsx scripts/migrate-images-to-drive.ts
```

The real command refuses to start without Drive OAuth configuration. It uploads
one row at a time, updates the row only after a Google Drive URL is returned,
continues after individual-row failures, and reports `scanned`, `migrated`,
`skipped` and `failed` totals. Do not run the real command against production
without an approved backup and migration window.
