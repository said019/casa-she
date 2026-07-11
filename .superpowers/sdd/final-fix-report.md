# Final fixes: private Google Drive payment proofs

## Delivered

- Added `GET /api/orders/:orderId/proofs/:proofId/content`. It requires an
  authenticated order owner or a current staff reviewer with the `caja`
  permission, and returns private, no-store proof bytes.
- The endpoint accepts legacy canonical image/PDF data URLs and only known
  Google Drive file IDs/URLs. It never follows a stored arbitrary external URL.
  Drive content is downloaded server-side with OAuth and streamed through the
  first-party endpoint.
- Removed stored proof URLs from order-list/detail API payloads. The client and
  admin verifier now request authenticated blobs, use temporary object URLs for
  image previews/lightboxes, and use **Ver comprobante** for PDFs. Google Drive
  URLs and branding are not rendered or opened.
- `POST /orders/:id/upload-proof` now opens a transaction, locks/rechecks the
  owned order before the storage call, and conditionally writes only a pending
  order. A stale upload cannot change a cancelled/rejected/approved order back
  to `pending_verification`.
- Drive image storage only becomes configured when all OAuth values and a
  nonblank `GOOGLE_DRIVE_FOLDER_ID` are present, preventing accidental writes to
  Drive root.

## Regression coverage

- `scripts/test-orders-proof-flow.ts` now verifies owner/admin access, denial
  for another client, legacy PNG/PDF content delivery, refusal to proxy an
  arbitrary URL, and upload/cancel concurrency ending in `cancelled` with no
  pending proof.
- `scripts/test-image-storage.ts` verifies accepted/rejected Drive URL parsing.

## Validation run

- `npx tsx scripts/test-orders-proof-flow.ts` — passed.
- `npx tsx scripts/test-image-storage.ts` — passed.
- `npm run build` in `backend` — passed.
- `npm run build` in `frontend` — passed (existing Browserslist/chunk-size
  warnings only).
- `git diff --check` — passed.
- `npx tsc --noEmit -p tsconfig.app.json` in `frontend` remains blocked by
  pre-existing errors outside this scope: `FilterPills.tsx`, `lib/push.ts`, and
  the user-modified `pages/client/Wallet.tsx` (`toast` is undefined). The new
  proof component and both modified views build successfully with Vite.

## Operational note

Serving old Drive proofs needs valid Google OAuth credentials. If Drive cannot
be read, the authenticated endpoint returns an error without exposing the Drive
URL.
