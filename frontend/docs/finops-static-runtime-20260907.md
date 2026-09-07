# Casa She frontend: lower-memory static runtime

Scope: frontend only, based on production `57bf1ed3ff89e3e9768d0c87804ad0430bba45b0`.
No changes to src/public, Vite config, npm dependencies/lockfiles, backend, database, jobs, bookings, payments or Wallet.

The existing Vite build remains intact. Build-only preparation downloads official Caddy 2.11.4 with pinned SHA-512 verification and keeps its license. It writes compressed Brotli/gzip sidecars without changing original files. Both frontend/railway.json (authoritative start override) and nixpacks.toml start Caddy directly. Node remains available at build time and unchanged npm start remains a fallback.

The existing service-worker VERSION stamp is preserved, including its historical bmb- prefix. Client and coach manifests, update prompts, push handlers, offline logic and galleries are unchanged. Caddy administration/automatic HTTPS/persistent config/directory browsing are disabled. Railway still terminates TLS; root is dist only; output symlinks are rejected.

## Verification

```sh
npm run build
node scripts/prepare-static-runtime.mjs
node scripts/test-caddy-static.mjs
```

Offline test: 175 source routes, 82 original files and 263 equivalent GET paths. Checks content, cache, MIME, redirects, ranges, HEAD, conditional requests, original-file preservation, corrupt-download rejection, compression and service-worker logic (normalizing only its existing build VERSION stamp). No production logins, bookings, payments, push registrations or database writes. A dedicated read-only-permission GitHub workflow runs the same test on Linux/Node 20; no secrets required.

Known invalid-URL differences: `/sw.js/` redirects 308 to canonical `/sw.js` instead of serving SPA HTML. `/../package.json` returns only public SPA HTML instead of Node's 400, never repository contents. Valid registration URL is checked byte-for-byte for content and JavaScript MIME.

Linux CI initially detected a platform MIME default difference for favicon.ico. Caddy now explicitly preserves Node's image/x-icon response; the equivalence assertion remains strict. No production deployment occurred before this correction.

Railway pre-deploy 24h: 360 in-window RAM samples, mean 0.1274495949 GB, max 0.1837124267 GB, last 0.095741952 GB. Decimal MB = GB * 1000. Local RSS is not Railway billing savings. Post-deploy full-window usage is required before claiming sustained savings.

## Release and rollback

Protect backend from this frontend-only merge: temporarily set its original empty watch patterns to `/backend/**`, then restore the exact original value after verification. Do not redeploy Postgres. Merge through normal GitHub workflow after checks; do not bypass failed CI.

Verify frontend SUCCESS/stopped=false, effective Caddy command, both public domains, all baseline HTTP hashes/cache and backend health. SW must differ only in VERSION and carry the merge commit prefix; do not normalize any other change away. Confirm backend/Postgres deployment IDs are unchanged and startup logs contain no OOM/crash.

Recovery: revert the frontend change via normal GitHub workflow with backend watch protection, or recover frontend deployment `a1e83593-c555-463b-8c99-bf35e5c67e52`. Previous start: `node node_modules/serve/build/main.js dist -s -p ${PORT:-8080}`. No database rollback, deletion or data migration.

References: [Caddy file_server](https://caddyserver.com/docs/caddyfile/directives/file_server), [try_files](https://caddyserver.com/docs/caddyfile/directives/try_files), [pinned release](https://github.com/caddyserver/caddy/releases/tag/v2.11.4).
