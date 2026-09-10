# Class Intensity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Show editable 1–3 fire intensity per scheduled session across public, client and admin views.

**Architecture:** Nullable integer `intensity` on classes and schedules, independent of technical level. Every class stores its snapshot; copying uses the source class and generation uses the schedule. One React component renders accessible emojis and a companion selector edits the four states. Seed only unambiguous schedule/session matches from approved images, without changing bookings or times.

**Tech Stack:** TypeScript, PostgreSQL, Express/Zod, React, React Query, Vite.

## Task 1: Backend persistence and propagation

- [ ] Add `backend/src/lib/classIntensity.ts`: `intensitySchema = z.number().int().min(1).max(3).nullable().optional()` and idempotent startup schema installer for `classes` and `schedules`: `ADD COLUMN IF NOT EXISTS intensity smallint CHECK (intensity BETWEEN 1 AND 3)`.
- [ ] Test schema acceptance of null/undefined/1/2/3 and rejection of 0/4/fractions/strings in `backend/scripts/test-class-intensity.ts` before wiring routes.
- [ ] Include `c.intensity`/`s.intensity` in list responses in `backend/src/routes/classes.ts` and `schedules.ts`; detail already selects `c.*`.
- [ ] Accept intensity in single, recurring, and update validators; bind it in inserts and updates. Omitted update leaves the original intact; explicit null clears it.
- [ ] In generation bind `schedule.intensity ?? null`; in `backend/src/lib/copy-week.ts` select and insert `c.intensity ?? null` as an extra parameter.
- [ ] Install columns during startup before serving routes; mirror definitions in `backend/database/schema_complete.sql`.
- [ ] Run `npm run build` and `npx tsx scripts/test-class-intensity.ts` in backend. Expected: exit 0.

## Task 2: Frontend presentation and editing

- [ ] Create `frontend/src/components/classes/ClassIntensity.tsx` with display and controlled select components. Rendering core: `Number.isInteger(value) && value >= 1 && value <= 3`, accessible label `Intensidad ${value} de 3`, text `'🔥'.repeat(value)`. Null renders nothing. Selector offers `Sin intensidad`, 1, 2, 3 and outputs number|null.
- [ ] Add `intensity?: number | null` to `frontend/src/types/class.ts`, `lib/schedule-state.ts`, and local response types. Preserve value in `components/Schedule.tsx` transformation.
- [ ] Display shared component near class name in Schedule, DaySpread, client confirmation/detail, studio schedule, admin calendar/detail and recurring schedules. Locate any additional actual session cards and reuse it there; do not invent intensity for discipline catalog cards.
- [ ] Wire create/edit/recurring forms in `pages/admin/classes/ClassesCalendar.tsx` and schedules editor in `pages/admin/schedules/WeeklySchedule.tsx`: default null; editing reads existing value; all payloads carry the value. Existing React Query invalidation refreshes data.
- [ ] Add a rendering/contract test; run frontend build and relevant TypeScript checks. Verify 3 flames, null hidden and invalid values hidden.

## Task 3: Approved image mapping and safe seed

- [ ] Add `backend/src/lib/classIntensityReference.ts` with all 47 approved day/time/class/instructor tuples, including Tuesday 20:00 Barre=2 versus other Barre=3. Salsa remains null.
- [ ] Normalize accents/case and only enumerated class/instructor aliases; never use generic substring matches.
- [ ] Add `backend/scripts/seed-class-intensity.ts`: preview by default, apply only with `--apply`. Transaction locks target rows, applies null values only and leaves ambiguous matches untouched. Match schedules by weekday/time/type/instructor and sessions by actual date weekday/time/type/instructor. Restrict sessions to today and future; do not rewrite historical classes. Report unmatched/ambiguous tuples and update counts without personal attendee data.
- [ ] Test distinctive entries, normalization and no match for wrong instructor/time. Preview live data before approved intensity-only writes.

## Task 4: Review and delivery

- [ ] Review against approved design and fix missed surfaces/propagation; obtain independent spec and code-quality review.
- [ ] Run targeted tests and both builds, inspect diff for unrelated changes.
- [ ] Commit only task files, push via normal project workflow and verify deployment status and health when publishing is authorized. Do not claim live behavior until deployment succeeds.
- [ ] Report intensity feature completion separately from the guest-payment feature, which is not implemented by this plan.
