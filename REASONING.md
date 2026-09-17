# Reasoning

Why the system is built the way it is: the priorities behind it, the design
decisions per module, what's deliberately deferred, and what would change
with more time. Companion to [`README.md`](./README.md), which documents
*what* exists; this documents *why*.

## Priorities, going in

The problem statement's own framing — "the desk's frustrations are the
spec" — pointed at three failure modes worth designing around before writing
any code:

1. **Double-booking is a correctness bug, not a UX bug.** A booking system
   that "usually" prevents overlaps but can fail under concurrent requests
   (two people at the front desk, or one impatient double-click) hasn't
   actually solved the problem. This shaped the single biggest decision in
   the codebase: don't rely on application code alone for BR1.
2. **The cancellation fee rule needs one unambiguous cutoff, not a vibe.**
   Boundary behavior (cancelling at *exactly* 24h) needed to be a decided,
   testable, one-line rule rather than something discovered by accident.
3. **Lookups (BR3/BR4) are secondary** — real, but not where a naive
   implementation quietly breaks. They got built last, after booking and
   cancellation were solid.

## Why the database enforces BR1

`backend/src/domain/bookingService.ts` checks for an overlap inside a Prisma
transaction *before* inserting. On its own, this is not race-safe: two
requests can both run that check, both see "no conflict," and both commit —
classic time-of-check-to-time-of-use (TOCTOU). At clinic scale this is not a
hypothetical; a slow front desk clicking twice, or two staff booking the same
popular doctor at the same moment, is exactly the scenario in the problem
statement.

The actual guarantee comes from a Postgres constraint, added in
`backend/prisma/migrations/20260917000002_add_overlap_exclusion_constraint/migration.sql`:

```sql
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING gist (
    "doctor_id" WITH =,
    tsrange("starts_at", "ends_at") WITH &&
  )
  WHERE ("status" = 'BOOKED');
```

An `EXCLUDE` constraint is enforced by Postgres itself at commit time — two
transactions inserting overlapping ranges for the same doctor cannot both
succeed, full stop, regardless of timing. The `WHERE status = 'BOOKED'`
clause means a cancelled appointment doesn't block rebooking that slot.

So the design has two layers, deliberately:
- **App-level check** — fast, gives a clean `BookingConflictError` /
  `409` in the common (non-racing) case, without needing to inspect a raw
  Postgres error.
- **DB-level constraint** — the actual correctness guarantee. When it fires
  (the race case), `bookingService.ts` catches it (matching on the
  constraint name / SQLSTATE `23P01`) and throws the *same*
  `BookingConflictError`, so callers never see two different error shapes
  for what is conceptually one failure mode.

This is more machinery than a single `if (overlap) reject` check, and that
extra step is deliberate: no amount of application-level care closes a
TOCTOU race; only the database can, because only the database sees both
transactions.

## Module-by-module

### Booking (BR1) — `overlap.ts`, `bookingService.ts`, `errors.ts`

- **Overlap math** (`overlap.ts`) uses half-open intervals (`[start, end)`),
  so back-to-back appointments are explicitly allowed, not an off-by-one
  accident.
- **Enforced:** BR1, including under concurrent requests.
- **Not handled here:** BR2/BR3/BR4 — kept in their own modules.
- **Trade-off:** the DB-constraint-violation detection in
  `isOverlapConstraintViolation()` pattern-matches on the constraint name /
  error text rather than a typed Prisma error code, because Postgres
  exclusion-constraint violations aren't one of Prisma's specifically-mapped
  error codes (unlike, say, unique-constraint violations → `P2002`). It's a
  bit fragile; see Limitations below.

### Cancellation (BR2) — `fee.ts`, `cancellationService.ts`

- The fee **decision** is a pure function (`decideCancellationFee(now,
  appointmentStart)`), deliberately separated from the **state transition**
  (`cancelAppointment`, which fetches/guards/persists). This means the
  boundary behavior of the rule can be tested with plain function calls, no
  database involved.
- `now` is an injectable parameter (defaults to `new Date()`), not read
  from `Date.now()` inline, specifically so the 24h boundary is
  deterministically testable rather than flaky-by-construction.
- **Server-side clock only:** `POST /appointments/:id/cancel` doesn't
  accept a client-supplied timestamp. A front desk (or its browser clock)
  isn't a trustworthy source for "when did the cancellation actually
  happen," especially since that timestamp determines whether a fee is
  charged.
- **Enforced:** BR2, including the exact-boundary case (≥24h → free).
- **Deliberately not handled:** no-shows (a patient who never cancels at
  all) — outside the cancellation flow described in the problem statement.
- **Trade-off:** cancelling an already-cancelled appointment throws
  `AlreadyCancelledError` (409) rather than idempotently returning the
  original outcome. A front-desk UI retry after a network hiccup will look
  like a failure instead of a no-op success — worth revisiting.

### Lookups (BR3, BR4) — `lookupService.ts`

- Both functions are plain, single-purpose Prisma queries — no query-builder
  abstraction, because two read paths don't justify one.
- **Day boundary assumption:** `getDoctorDay` treats the incoming date as
  UTC midnight, window `[day, day + 24h)`. This is a real, documented
  assumption, not an accident — see Limitations.
- **Patient name search** (`findAppointmentsByPatientName`) is
  case-insensitive partial match, because front-desk staff typing a name
  from memory rarely have the exact spelling.
- Both include cancelled appointments in results, not just `BOOKED` ones —
  the desk needs to see "this slot was cancelled," not have it silently
  vanish from a day view or a patient's history.

### API layer — `routes/*.ts`, `app.ts`, `errorHandler.ts`

- One centralized `errorHandler` maps typed domain errors
  (`BookingConflictError` → 409, `NotFoundError` → 404,
  `InvalidRangeError`/`ZodError` → 400, `AlreadyCancelledError` → 409)
  instead of repeating try/catch + status-code logic in every route handler.
  This is the one small abstraction introduced beyond straight-line code,
  justified by: four route handlers already needed identical error mapping,
  and a fifth (or a frontend consumer) shouldn't have to guess the shape.
- `app.ts` is a factory function (`createApp()`), not a script that calls
  `.listen()` — so an eventual test suite can `import { createApp }` and
  drive it with `supertest` directly, without binding a real port.
- Added `GET /patients?name=` (search *patient records*) alongside the
  spec'd `GET /patients/search?name=` (BR4, search *appointments* by
  patient name) — the booking form's patient picker needs the former to
  attach a new booking to an existing patient without creating a duplicate;
  it's not one of the four core business rules, but the booking workflow is
  non-functional without it.

### Frontend

- Three tabs (`Book` / `Doctor's Day` / `Find Patient`) map 1:1 to BR1+BR2,
  BR3, and BR4 — no navigation structure invented beyond what the workflows
  need.
- The booking form does **not** duplicate the overlap check client-side. It
  submits and surfaces whatever the API returns, including the 409 message
  verbatim. Reimplementing BR1's logic in the browser would create a second
  place for it to be wrong, and the browser can never be the source of
  truth for a check that has to hold across concurrent requests anyway.
- `PatientPicker` debounces search (300ms) rather than firing a request per
  keystroke — a small, standard efficiency call, not architecture.

## What's deliberately out of scope

- **Tests** — postponed by explicit decision mid-project, not an oversight.
  Planned: `overlap.ts` interval-math edge cases (partial overlap,
  containment, back-to-back), `fee.ts` boundary cases (exactly 24h, just
  under, just over, far past), and — most importantly — an integration test
  that fires two genuinely concurrent `POST /appointments` requests at a
  live Postgres instance to prove the `EXCLUDE` constraint, not just the
  app-level check, is what's actually stopping the second one.
- **Auth / multi-tenant clinics** — the problem statement is "a busy clinic
  with a few doctors," not a SaaS platform. No login, no per-clinic data
  isolation. Adding it now would be solving a problem that wasn't asked.
- **No-show handling** — distinct from cancellation; not in the storyline.
- **Doctor/patient CRUD beyond what booking needs** — no edit/delete
  endpoints for doctors or patients, since the workflows described don't
  call for them.

## Known limitations / what I'd improve with more time

- **Constraint-violation detection is string-matching**
  (`bookingService.ts`), not a typed error code — works, but the DB error
  code path (`23P01`) is only asserted by a substring check on the error
  message today. A live-Postgres integration test would pin down the exact
  shape Prisma actually throws and make this robust instead of "probably
  fine."
- **Day-view timezone assumption is UTC-midnight**, which is simple and
  documented but not necessarily what a real clinic wants if it's not
  operating in UTC — a real deployment needs a clinic-configured timezone,
  not a hardcoded one.
- **Cancel-an-already-cancelled-appointment is a 409, not idempotent** —
  see the Cancellation section above.
- **Cancellation fee numbers are placeholders** (`CANCELLATION_POLICY` in
  `fee.ts`: 24h cutoff, flat $20) pending the clinic's actual policy — they
  live in one named-constant location specifically so this is a one-line
  change, not a hunt through the codebase.
- **No pagination** on `/patients/search`, `/patients`, or the day view —
  fine at "a few doctors" scale; would need it before this saw the appointment
  volume of a larger clinic.

## Process note

This was built in explicit phases (domain logic → API layer → migrations/
seed → frontend), one module generated and reasoned about at a time rather
than all at once, so each business rule could be checked off deliberately
instead of discovered missing at the end.
