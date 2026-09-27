# October Schedule and Guest Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax for tracking.

**Goal:** Publish the approved September 28–October 31 schedule and one/two complimentary guest benefits for existing and new eligible memberships.

**Architecture:** Extend transactional companion reservations with campaign-scoped numbered coupons and an atomic batch endpoint. A separate date-bound schedule operation preserves IDs/reservations and queues partner synchronization.

**Tech Stack:** Express/TypeScript, PostgreSQL, React Query, Playwright, Railway.

---

### 1. Campaign backend (parent)
- [ ] Add `backend/src/lib/companionPromotion.ts`: exported window constants, plan eligibility, read quota scoped to membership/campaign, atomic creation on caller transaction.
- [ ] Extend `backend/src/lib/companionSchema.ts`: promo_free constraint, campaign_id, promotion_slot, promotion_request_id, unique live coupon index. Cancellation releases promo coupons only timely/class cancellation.
- [ ] Extend `backend/src/lib/companions.ts`: preserve baseline policy; promotion member can use courtesy at zero remaining, require whole batch capacity and same host. Suppress ordinary monthly_free during promo. Payment callback opts out of promotion quota checks.
- [ ] Extend `backend/src/routes/companions.ts`: POST `/booking/:bookingId/promotion` body `{requestId,guests:[{name,phone}]}`; authorized host/staff, idempotent retries; normal endpoint rejects promo mode and directs to batch.
- [ ] Add `backend/scripts/test-companion-promotion.ts` to run against localhost-only isolated PG schema. Assert pack credit unchanged, monthly batch size 2, duplicate phone rejects, no half-batch, third coupon denied, second host denied, capacity2 required, Sept27/Nov1 excluded, partial/full cancellation restores appropriate quota, inactive/expired blocks, normal payment remains independent.
- [ ] Run promotion test and existing test:companions + backend build.

### 2. Promotion UI (frontend implementer)
- [ ] Update `frontend/src/components/bookings/CompanionPanel.tsx` to display policy promotion `{campaignId,startDate,endDate,total,remaining,requiredGuests,eligible,reason}`. Mode adds promo_free. POST new endpoint for promotion fields (1 or2 based on requiredGuests); preserve single paid/credit flow.
- [ ] Extend `frontend/e2e/tests/companions.spec.ts`: one courtesy submits one, monthly submits both together, no button if capacity insufficient, baseline paid flow retained. Clear batch identity on changed form, preserve for retries.
- [ ] Build and test Chromium/mobile.

### 3. Schedule (parent)
- [ ] Add `backend/src/data/casa-she-october-2026.ts` with literal verified rows, date window, flame override Navakarana Tuesday19:00=2.
- [ ] Add `backend/scripts/apply-october-2026.ts` dry-run default. Query actual teachers/types/templates/classes before mapping names. No guessed existing IDs. Reuse matching class rows; adjust no-booking same-time counterpart; create missing, cancel only obsolete no-booking rows. Fail on occupied removals and live checkout holds. Create Román agenda profile without login only if absent.
- [ ] Dry-run must report operations and existing reservation retention. Apply inside BEGIN/COMMIT with class locks and counts recheck. Queue partner resync/delete; never alter history/November.
- [ ] Verify exact day/type/coach/time sets via public API for full window.

### 4. Review and release
- [ ] Spec review then quality review, fix findings and re-review.
- [ ] Commit scoped files; integrate remote main without overwriting other work; publish approved changes.
- [ ] Verify backend/frontend deploys, schema guards, public schedule and shipped promo panel. Report any blocked schedule rows precisely.
