# October rollout validation

- Promotion spec review: PASS; independent quality review: no blocking findings.
- Schedule transcript and operation independently reviewed: PASS, 52 weekly slots / 257 occurrences.
- Backend TypeScript build and frontend Vite production build: PASS.
- Isolated PostgreSQL promotion test: PASS (atomic pair, credits unchanged, capacity, duplicate phones, retry, concurrent membership quota, campaign boundaries, timely/late cancellation and paid-policy isolation).
- Existing isolated PostgreSQL companions test and unlimited daily-limit test: PASS.
- Playwright desktop/mobile: 8/8 PASS.
- Broad existing `npm test` cannot complete here: waitlist integration requires a configured full test database and running API; `/api/health` unavailable. No production database was used for tests.
- Frontend full TypeScript check has existing unrelated errors in FilterPills, push and Events; production build and changed-file lint pass.

## Production schedule operation

Window: September 28–October 31, 2026. Two rollback-only previews verified before applying.
First transaction: kept 11, updated 8, created 238 and canceled 11 obsolete unoccupied classes.
Existing Flow Yoga reservation preserved with class ID `943f17a7-ecb6-4476-9fb5-346fe27eb7ff`.
Canceled history was not deleted or reactivated. Román was added as agenda-only instructor with inactive login and no password or payment configuration.
Public API then revealed two legacy null-facility classes, explicitly scoped by ID for a second reviewed reconciliation: `09f38162-f2fd-4302-b63c-1b1ca34552d1` and `b0e297dc-b997-4e7b-9046-0e3b1f7d08f3`. Preview preserved all 257 new entries and canceled only those two unoccupied rows. Same reservation/checkout/partner guard applied.

Verification: `backend/scripts/verify-october-2026.ts` compares the public API's full date/type/coach/time set against the approved schedule, confirms all five Tuesday Navakarana intensities and the preserved reservation.

Public verification PASS after both commits. Backend/frontend deployment of `ad578ee` SUCCESS. Added a bounded generation guard after identifying 53 active old Condesa templates: both cron and manual generation skip the already-managed window, preserving November behavior and other facilities. No active null-facility schedules exist. Pure boundary/count/wiring test and backend build PASS; independent spec review PASS. Cron generation is currently excluded by the production allowlist; guard also covers manual generation and future re-enablement. No runtime generator test was executed against production.
