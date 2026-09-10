# Class intensity verification

- Backend TypeScript build: passed.
- Backend intensity validation/reference tests: passed (all 47 reference tuples, invalid values, aliases, ambiguous groups and existing-value preservation).
- Local PostgreSQL integration: passed (idempotent DDL, constraints, real copy-week dry run/copy/repeat, NULL and cancelled-class propagation, template isolation). Test schema rolled back and local server stopped.
- Unlimited-membership daily-limit regression test: passed; no changes to that policy.
- Frontend production build: passed.
- Browser component/form tests: passed for valid/missing/invalid values, accessibility, selector clearing, recurring template editing with NULL specific_date, session create/edit, recurring create, desktop/mobile schedule, Bio navigation/reservation and landing card/detail.
- Independent specification and code-quality reviews: passed after fixes for additional session surfaces, canonical alias grouping, required schema startup gating and recurring-template NULL date input.
- Full frontend typecheck has pre-existing errors in FilterPills, push and Events; the production build passes. The unrelated existing recurring-class integration suite could not run without its configured application test database. No production booking tests were performed.

## Initial data application

Previewed and then applied transactionally on 2026-09-10:

- 109 future scheduled sessions received intensity.
- 39 active schedule templates received intensity.
- No dates, times, instructors, capacity, bookings or prices were changed.
- Existing non-NULL intensity is never overwritten. The one-time seed flag prevents reruns from undoing later manual clears.
- Duplicate Barre/Shelle sessions at Tuesday 19:00 on September 15, 22 and 29 were left unset. Other sessions not matching the images were left unset, including Salsa as specified.
- Notable schedule differences left untouched: Saturday 10:00 instructor assignments, Monday morning old classes, generic Sculpt instead of Abs & Butt and Vinyasa + Yin versus the pictured Vinyasa.

The guest/companion booking and payment workflow remains separate pending work; this release implements intensity only.
