# Multiple Memberships, Credit Selection & Sample-Class Block — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user has several active memberships, booking a class consumes the correct one (valid for the class's studio, expiring soonest, bounded before unlimited) instead of being blocked; and the $99 Clase Muestra cannot be bought when the user already has an active package membership.

**Architecture:** A pure ranking function (`pickBestMembership`) decides which membership wins given candidate rows — testable with `node:assert` like the existing `studioBookingError`. A thin DB wrapper (`selectMembershipForBooking`) runs the filtered `SELECT ... FOR UPDATE` and delegates ranking to the pure function. The 3 booking auto-selects in `bookings.ts` call the wrapper. A `canBuySamplePlan` predicate gates Clase Muestra purchase in `POST /orders`.

**Tech Stack:** TypeScript, Express, node-postgres (`pg`), `tsx` test scripts with `node:assert/strict` (no jest/vitest in this repo).

**Spec:** `docs/superpowers/specs/2026-05-19-multiple-memberships-credit-selection-design.md`

---

## File Structure

- **Create** `src/lib/membershipSelection.ts` — `pickBestMembership` (pure ranking) + `selectMembershipForBooking` (DB wrapper with `FOR UPDATE`).
- **Create** `scripts/test-membership-selection.ts` — assertion script for `pickBestMembership`.
- **Modify** `src/lib/loyalty.ts` — add `canBuySamplePlan`.
- **Create** `scripts/test-can-buy-sample.ts` — assertion script for the SQL shape of `canBuySamplePlan` (pure helper extracted).
- **Modify** `src/routes/bookings.ts` — replace 3 auto-select queries with `selectMembershipForBooking`.
- **Modify** `src/routes/orders.ts` — block Clase Muestra purchase when `canBuySamplePlan` is false.
- **Modify** `package.json` — add new test scripts to the `test` chain.

Pure logic (ranking, predicate-as-data) is separated from SQL so it is unit-testable without a database, mirroring `src/lib/membershipStudio.ts`.

---

### Task 1: Pure membership ranking function

**Files:**
- Create: `src/lib/membershipSelection.ts`
- Test: `scripts/test-membership-selection.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/test-membership-selection.ts`:

```typescript
import assert from 'node:assert/strict';
import { pickBestMembership, type CandidateMembership } from '../src/lib/membershipSelection.js';

const base = (o: Partial<CandidateMembership>): CandidateMembership => ({
  id: 'm', classes_remaining: 5, end_date: '2026-06-01',
  created_at: '2026-01-01', bound_facility_id: null, ...o,
});

// Bounded expiring sooner beats bounded expiring later (same studio: mixto/null)
assert.equal(
  pickBestMembership([
    base({ id: 'late', end_date: '2026-07-01' }),
    base({ id: 'soon', end_date: '2026-06-01' }),
  ], null)?.id,
  'soon',
);

// Individual bound to studio A is excluded when class is in studio B; mixto wins
assert.equal(
  pickBestMembership([
    base({ id: 'indivA', bound_facility_id: 'A', end_date: '2026-06-01' }),
    base({ id: 'mixto', bound_facility_id: null, end_date: '2026-07-01' }),
  ], 'B')?.id,
  'mixto',
);

// Individual bound to A is chosen when class IS in studio A and expires sooner
assert.equal(
  pickBestMembership([
    base({ id: 'indivA', bound_facility_id: 'A', end_date: '2026-06-01' }),
    base({ id: 'mixto', bound_facility_id: null, end_date: '2026-07-01' }),
  ], 'A')?.id,
  'indivA',
);

// Bounded beats unlimited even if unlimited expires sooner
assert.equal(
  pickBestMembership([
    base({ id: 'unlim', classes_remaining: null, end_date: '2026-06-01' }),
    base({ id: 'bnd', classes_remaining: 3, end_date: '2026-07-01' }),
  ], null)?.id,
  'bnd',
);

// Unlimited chosen when it is the only valid option
assert.equal(
  pickBestMembership([base({ id: 'unlim', classes_remaining: null })], null)?.id,
  'unlim',
);

// Tie on end_date → older created_at wins
assert.equal(
  pickBestMembership([
    base({ id: 'newer', created_at: '2026-02-01' }),
    base({ id: 'older', created_at: '2026-01-01' }),
  ], null)?.id,
  'older',
);

// classFacilityId null + bounded membership → not eligible → null
assert.equal(pickBestMembership([base({ bound_facility_id: 'A' })], null), null);

// No candidates → null
assert.equal(pickBestMembership([], 'A'), null);

console.log('test-membership-selection: OK');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test-membership-selection.ts`
Expected: FAIL — `Cannot find module '../src/lib/membershipSelection.js'`.

- [ ] **Step 3: Write minimal implementation (pure function only)**

Create `src/lib/membershipSelection.ts`:

```typescript
export interface CandidateMembership {
  id: string;
  classes_remaining: number | null; // null = unlimited
  end_date: string | null;          // ISO date or null = no expiry
  created_at: string;               // ISO timestamp
  bound_facility_id: string | null; // null = mixto / unbound
}

/**
 * Studio rule (SQL twin of studioBookingError): a membership is eligible for a
 * class iff it is unbound, OR it is bound to exactly the class's studio (and
 * the class studio is known). Mirrors src/lib/membershipStudio.ts.
 */
function isStudioEligible(
  m: CandidateMembership,
  classFacilityId: string | null,
): boolean {
  if (m.bound_facility_id === null) return true;
  return classFacilityId !== null && m.bound_facility_id === classFacilityId;
}

/**
 * Pick the membership to consume: among studio-eligible candidates, bounded
 * before unlimited, then soonest end_date (nulls last), then oldest created_at.
 * Returns null if none eligible. Pure — no DB. Caller is responsible for the
 * credits filter (done in SQL).
 */
export function pickBestMembership(
  candidates: CandidateMembership[],
  classFacilityId: string | null,
): CandidateMembership | null {
  const eligible = candidates.filter(m => isStudioEligible(m, classFacilityId));
  if (eligible.length === 0) return null;

  const rank = (m: CandidateMembership) => (m.classes_remaining === null ? 1 : 0);
  const endKey = (m: CandidateMembership) =>
    m.end_date === null ? Number.MAX_SAFE_INTEGER : new Date(m.end_date).getTime();

  eligible.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);          // bounded first
    if (endKey(a) !== endKey(b)) return endKey(a) - endKey(b);  // soonest expiry
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
  return eligible[0];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/test-membership-selection.ts`
Expected: `test-membership-selection: OK`

- [ ] **Step 5: Commit**

```bash
git add src/lib/membershipSelection.ts scripts/test-membership-selection.ts
git commit -m "feat: pure pickBestMembership ranking with tests"
```

---

### Task 2: DB wrapper `selectMembershipForBooking`

**Files:**
- Modify: `src/lib/membershipSelection.ts` (append)

No new unit test: this is a thin DB query whose ranking is already covered by Task 1. It is exercised by integration in Task 5.

- [ ] **Step 1: Append the DB wrapper**

Add to `src/lib/membershipSelection.ts`:

```typescript
// pg PoolClient or Pool both expose .query(text, params)
type DbClient = { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> };

/**
 * Locks (FOR UPDATE) and returns the membership to consume for a booking, or
 * null. Must be called inside the booking transaction. Applies state, expiry,
 * credits and studio filters in SQL, then ranks via pickBestMembership.
 */
export async function selectMembershipForBooking(params: {
  db: DbClient;
  userId: string;
  classFacilityId: string | null;
  requiredCredits: number;
}): Promise<any | null> {
  const { db, userId, classFacilityId, requiredCredits } = params;
  const { rows } = await db.query(
    `SELECT m.*,
            COALESCE(m.facility_id, o.facility_id) AS bound_facility_id
       FROM memberships m
       LEFT JOIN orders o ON o.id = m.order_id
      WHERE m.user_id = $1
        AND m.status = 'active'
        AND (m.end_date IS NULL
             OR m.end_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
                               AT TIME ZONE 'America/Mexico_City')::date)
        AND (m.classes_remaining IS NULL OR m.classes_remaining >= $2)
      FOR UPDATE OF m`,
    [userId, requiredCredits],
  );

  const candidates = rows.map(r => ({
    id: r.id,
    classes_remaining: r.classes_remaining,
    end_date: r.end_date ? new Date(r.end_date).toISOString() : null,
    created_at: new Date(r.created_at).toISOString(),
    bound_facility_id: r.bound_facility_id ?? null,
  }));

  const winner = pickBestMembership(candidates, classFacilityId);
  if (!winner) return null;
  return rows.find(r => r.id === winner.id) ?? null;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `membershipSelection.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/membershipSelection.ts
git commit -m "feat: selectMembershipForBooking DB wrapper with FOR UPDATE"
```

---

### Task 3: `canBuySamplePlan` predicate

**Files:**
- Modify: `src/lib/loyalty.ts` (append near `consumeSampleClassDiscount`)
- Test: `scripts/test-can-buy-sample.ts`

The eligibility *decision* is pure (given a count of active package memberships); the SQL just produces that count. Extract the pure part to keep it testable.

- [ ] **Step 1: Write the failing test**

Create `scripts/test-can-buy-sample.ts`:

```typescript
import assert from 'node:assert/strict';
import { isSamplePurchaseAllowed } from '../src/lib/loyalty.js';

// No active package memberships → allowed
assert.equal(isSamplePurchaseAllowed(0), true);
// Has at least one active package membership → blocked
assert.equal(isSamplePurchaseAllowed(1), false);
assert.equal(isSamplePurchaseAllowed(3), false);

console.log('test-can-buy-sample: OK');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test-can-buy-sample.ts`
Expected: FAIL — `isSamplePurchaseAllowed` is not exported.

- [ ] **Step 3: Add the pure helper and the DB predicate**

Append to `src/lib/loyalty.ts`:

```typescript
/**
 * Pure decision: a user may buy the Clase Muestra only if they have NO active
 * package membership (class_limit > 1). activePackageCount is produced by the
 * DB query in canBuySamplePlan.
 */
export function isSamplePurchaseAllowed(activePackageCount: number): boolean {
  return activePackageCount === 0;
}

/**
 * True if the user can buy the Clase Muestra ($99, package_type='sample').
 * Blocked when they already hold an active membership of a real package
 * (plan.class_limit > 1). Input validation — no FOR UPDATE needed.
 */
export async function canBuySamplePlan(params: {
  db: DbClient;
  userId: string;
}): Promise<boolean> {
  const { db, userId } = params;
  const r = await db.query(
    `SELECT COUNT(*)::int AS n
       FROM memberships m
       JOIN plans p ON p.id = m.plan_id
      WHERE m.user_id = $1
        AND m.status = 'active'
        AND p.class_limit > 1`,
    [userId],
  );
  return isSamplePurchaseAllowed(r.rows[0]?.n ?? 0);
}
```

Note: `DbClient` is already declared/used in `loyalty.ts` (used by
`consumeSampleClassDiscount`). Reuse the existing type; do not redeclare it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/test-can-buy-sample.ts`
Expected: `test-can-buy-sample: OK`

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no new errors.

```bash
git add src/lib/loyalty.ts scripts/test-can-buy-sample.ts
git commit -m "feat: canBuySamplePlan predicate with pure helper + tests"
```

---

### Task 4: Wire test scripts into `npm test`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Extend the test chain**

In `package.json`, change the `test` script from:

```json
"test": "tsx scripts/test-membership-studio.ts && tsx scripts/test-dashboard-studio.ts && tsx scripts/test-manual-income.ts"
```

to:

```json
"test": "tsx scripts/test-membership-studio.ts && tsx scripts/test-dashboard-studio.ts && tsx scripts/test-manual-income.ts && tsx scripts/test-membership-selection.ts && tsx scripts/test-can-buy-sample.ts"
```

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: all scripts print `... : OK`, including the two new ones.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "test: include membership-selection and sample-block scripts"
```

---

### Task 5: Use the selector in client booking (`POST /`)

**Files:**
- Modify: `src/routes/bookings.ts` (the `POST /` handler, auto-select block ~lines 418-465)

- [ ] **Step 1: Add the import**

At the top of `src/routes/bookings.ts`, next to the existing
`import { studioBookingError } from '../lib/membershipStudio.js';`, add:

```typescript
import { selectMembershipForBooking } from '../lib/membershipSelection.js';
```

- [ ] **Step 2: Replace the auto-select branch**

In the `if (!isFreeClass) { ... }` block, replace the entire
`if (!membershipId) { ... } else { ... }` selection AND the subsequent
separate `studioBinding` / `studioBookingError` check with the logic below.
Rationale: studio filtering now happens *inside* the selector, so a user with
a valid mixto is no longer blocked by an unrelated individual membership.

Replace this existing region:

```typescript
            if (!membershipId) {
                const activeMemberships = await query(
                    `SELECT * FROM memberships
                     WHERE user_id = $1
                     AND status = 'active'
                     AND (end_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City')::date OR end_date IS NULL)
                     AND (classes_remaining > 0 OR classes_remaining IS NULL)
                     ORDER BY end_date ASC
                     LIMIT 1`,
                    [userId]
                );

                if (activeMemberships.length === 0) {
                    console.log('No active membership found for user:', userId);
                    return res.status(403).json({ error: 'No tienes una membresía activa o créditos disponibles.' });
                }
                membershipId = activeMemberships[0].id;
            } else {
                const membership = await queryOne(
                    `SELECT * FROM memberships WHERE id = $1 AND user_id = $2`,
                    [membershipId, userId]
                );
                if (!membership) return res.status(403).json({ error: 'Membresía inválida' });
                if (membership.status !== 'active') return res.status(403).json({ error: 'Membresía no activa' });
                if (membership.classes_remaining !== null && membership.classes_remaining <= 0) {
                    return res.status(403).json({ error: 'Sin créditos disponibles en esta membresía' });
                }
            }

            // Regla: paquete individual solo permite reservar en su estudio atado.
            const studioBinding = await queryOne<{ bound_facility_id: string | null; bound_facility_name: string | null }>(
                `SELECT COALESCE(m.facility_id, o.facility_id) AS bound_facility_id,
                        f.name AS bound_facility_name
                 FROM memberships m
                 LEFT JOIN orders o ON o.id = m.order_id
                 LEFT JOIN facilities f ON f.id = COALESCE(m.facility_id, o.facility_id)
                 WHERE m.id = $1`,
                [membershipId]
            );
            const studioErr = studioBookingError(
                studioBinding?.bound_facility_id ?? null,
                classDetails.facility_id ?? null,
                studioBinding?.bound_facility_name ?? null
            );
            if (studioErr) {
                return res.status(422).json({ error: studioErr });
            }
```

with:

```typescript
            if (membershipId) {
                // Explicit membership: validate ownership, status, credits, studio.
                const membership = await queryOne(
                    `SELECT m.*, COALESCE(m.facility_id, o.facility_id) AS bound_facility_id,
                            f.name AS bound_facility_name
                     FROM memberships m
                     LEFT JOIN orders o ON o.id = m.order_id
                     LEFT JOIN facilities f ON f.id = COALESCE(m.facility_id, o.facility_id)
                     WHERE m.id = $1 AND m.user_id = $2`,
                    [membershipId, userId]
                );
                if (!membership) return res.status(403).json({ error: 'Membresía inválida' });
                if (membership.status !== 'active') return res.status(403).json({ error: 'Membresía no activa' });
                if (membership.classes_remaining !== null && membership.classes_remaining <= 0) {
                    return res.status(403).json({ error: 'Sin créditos disponibles en esta membresía' });
                }
                const studioErr = studioBookingError(
                    membership.bound_facility_id ?? null,
                    classDetails.facility_id ?? null,
                    membership.bound_facility_name ?? null
                );
                if (studioErr) return res.status(422).json({ error: studioErr });
            } else {
                // Auto-select: studio filtering happens inside the selector, so a
                // valid mixto is used instead of being blocked by an individual.
                const picked = await selectMembershipForBooking({
                    db: { query: (t, p) => query(t, p).then(rows => ({ rows })) },
                    userId: userId as string,
                    classFacilityId: classDetails.facility_id ?? null,
                    requiredCredits: 1,
                });
                if (!picked) {
                    return res.status(400).json({
                        error: 'No tienes una membresía válida con créditos para una clase en este estudio.'
                    });
                }
                membershipId = picked.id;
            }
```

Note: this handler uses the `query()` helper (not an explicit transaction
client) for selection, matching the existing code in this block. The adapter
`{ query: (t,p) => query(t,p).then(rows => ({ rows })) }` shapes the existing
`query()` return into the `{ rows }` the selector expects. If `query()` already
returns `{ rows }`, pass it directly instead — verify by reading the
`query` export in `src/config/database.js` before implementing this step.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors in `bookings.ts`.

- [ ] **Step 4: Manual smoke (documented, run if a dev DB is available)**

With a user having an individual membership bound to studio A and a mixto:
booking a class in studio B must succeed consuming the mixto (previously 422).
Booking in studio A must consume the individual (sooner expiry) per the rule.

- [ ] **Step 5: Commit**

```bash
git add src/routes/bookings.ts
git commit -m "fix: client booking selects a studio-valid membership instead of blocking"
```

---

### Task 6: Use the selector in admin `POST /bulk-month`

**Files:**
- Modify: `src/routes/bookings.ts` (the `bulk-month` handler, selection block ~lines 222-254)

- [ ] **Step 1: Replace the auto-select query**

In the `bulk-month` handler, the selection currently is:

```typescript
        let membership: any = null;
        if (membershipId) {
            const { rows } = await client.query(
                `SELECT * FROM memberships WHERE id = $1 AND user_id = $2 FOR UPDATE`,
                [membershipId, userId]
            );
            membership = rows[0] || null;
        } else {
            const { rows } = await client.query(
                `SELECT * FROM memberships
                 WHERE user_id = $1 AND status = 'active'
                   AND (classes_remaining IS NULL OR classes_remaining >= $2)
                 ORDER BY
                   CASE WHEN classes_remaining IS NULL THEN 1 ELSE 0 END ASC,
                   end_date ASC NULLS LAST
                 LIMIT 1
                 FOR UPDATE`,
                [userId, targetClasses.length]
            );
            membership = rows[0] || null;
        }
```

Replace ONLY the `else` branch body with the selector call (keep the
explicit-`membershipId` branch as-is — admin bulk owns scheduling and may
target any membership):

```typescript
        let membership: any = null;
        if (membershipId) {
            const { rows } = await client.query(
                `SELECT * FROM memberships WHERE id = $1 AND user_id = $2 FOR UPDATE`,
                [membershipId, userId]
            );
            membership = rows[0] || null;
        } else {
            // Bulk-month classes may span studios; pass null facility so only
            // unbound (mixto/unlimited) memberships are auto-eligible, matching
            // prior behavior of not studio-filtering bulk but now consistent
            // with the shared ranking (bounded-first, soonest expiry).
            membership = await selectMembershipForBooking({
                db: client,
                userId: userId as string,
                classFacilityId: null,
                requiredCredits: targetClasses.length,
            });
        }
```

`client` is the `pg` transaction client already in scope; it matches the
`DbClient` shape (`.query(text, params) → { rows }`) directly, no adapter.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/bookings.ts
git commit -m "refactor: bulk-month uses shared membership selector"
```

---

### Task 7: Block Clase Muestra purchase in `POST /orders`

**Files:**
- Modify: `src/routes/orders.ts` (the `POST /` handler, after the plan is loaded ~line 285, before the transaction at ~line 321)

- [ ] **Step 1: Add the import**

In `src/routes/orders.ts`, extend the existing loyalty import. It currently is:

```typescript
import { awardPaymentLoyaltyPoints, awardReferralBonus, consumeSampleClassDiscount } from '../lib/loyalty.js';
```

Change to:

```typescript
import { awardPaymentLoyaltyPoints, awardReferralBonus, consumeSampleClassDiscount, canBuySamplePlan } from '../lib/loyalty.js';
```

- [ ] **Step 2: Add the guard after the plan is fetched**

Immediately after the existing not-found check:

```typescript
        if (!plan) {
            return res.status(404).json({ error: 'Plan no encontrado o no disponible' });
        }
```

insert:

```typescript
        // Clase Muestra is for new clients only: block if the user already
        // holds an active package membership (class_limit > 1).
        if (plan.package_type === 'sample') {
            const allowed = await canBuySamplePlan({
                db: { query: (t: string, p?: any[]) => query(t, p).then((rows: any) => ({ rows })) },
                userId: userId as string,
            });
            if (!allowed) {
                return res.status(409).json({
                    error: 'La Clase Muestra es solo para nuevas clientas. Ya cuentas con un paquete activo.'
                });
            }
        }
```

Before implementing, verify the `query` helper's return shape in
`src/config/database.js`: if `query()` already returns `{ rows }`, pass
`{ query }` directly without the `.then(...)` adapter. Use whichever matches.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors in `orders.ts`.

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: all scripts OK.

- [ ] **Step 5: Commit**

```bash
git add src/routes/orders.ts
git commit -m "feat: block Clase Muestra purchase when user has an active package"
```

---

### Task 8: Final verification

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: no errors introduced by this work (pre-existing unused-var hints in
`orders.ts`/`bookings.ts` are acceptable and unrelated).

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: every `test-*` script prints `OK`.

- [ ] **Step 3: Spec coverage check**

Confirm against the spec: studio-aware selection (Tasks 1,2,5,6),
bounded-before-unlimited & soonest-expiry & created_at tiebreak (Task 1),
no membership limit (no code enforces a cap — verified by absence),
sample block on active package (Tasks 3,7), $99 discount untouched
(no change to `consumeSampleClassDiscount`).

- [ ] **Step 4: Push to trigger deploy**

```bash
git push origin docs/endpoint-test-plan
```

---

## Self-Review

**Spec coverage:**
- Rule 1 (valid-for-studio + soonest expiry + unlimited last + skip invalid):
  Task 1 (`pickBestMembership` + tests), Task 2 (SQL filters), Tasks 5/6 (wired).
- Rule 2 (no membership limit): no cap is added anywhere; Task 8 Step 3 verifies.
- Rule 3 (block Muestra if active package, class_limit>1): Tasks 3, 7.
- Rule 4 ($99 discount unchanged): no task modifies `consumeSampleClassDiscount`.
- Edge cases (tie, unlimited-only, explicit membershipId, free class, race):
  Task 1 tests cover tie/unlimited/null-facility; Task 5 preserves free-class
  path (change is inside `if (!isFreeClass)`), explicit `membershipId` branch,
  and `FOR UPDATE` race serialization (Task 2 SQL).

**Placeholder scan:** No TBD/TODO. Every code step shows complete code. The two
"verify `query()` return shape" notes are explicit conditional instructions
with both branches specified, not placeholders.

**Type consistency:** `pickBestMembership(candidates, classFacilityId)` and
`CandidateMembership` defined in Task 1, used identically in Task 2.
`selectMembershipForBooking({db,userId,classFacilityId,requiredCredits})`
defined Task 2, called with that exact shape in Tasks 5 and 6.
`canBuySamplePlan({db,userId})` / `isSamplePurchaseAllowed(n)` defined Task 3,
used identically in Task 7. `DbClient` reused from existing `loyalty.ts` (Task 3
note) and structurally matched by the `pg` client (Task 6) and the `query`
adapter (Tasks 5, 7).
