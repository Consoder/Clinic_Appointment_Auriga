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

## The twists (T6, T2, T1)

Added after the core four business rules, in this order: T6 (reschedule, no
new infrastructure needed), then a shared virtual clock, then T2 (no-show
sweep), then T1 (reminders) — T1 and T2 both needed the clock first.

### T6 — Reschedule (`rescheduleService.ts`)

Deliberately mirrors `bookingService.ts` rather than introducing a different
pattern: same two-layer guard (app-level check inside a transaction, backed
by the same `appointments_no_overlap` `EXCLUDE` constraint). An `UPDATE`
naturally only checks the new row against every *other* row for that
constraint, so no self-exclusion trick was needed on the DB side — the
existing constraint just works for reschedule with zero changes to the
migration. The shared `isOverlapConstraintViolation()` check was extracted
from `bookingService.ts` into `overlap.ts` specifically so this didn't have
to duplicate it. Only a `BOOKED` appointment can be rescheduled — moving a
cancelled/completed/no-show appointment doesn't mean anything.

### Why a virtual clock

T1 ("each morning") and T2 ("30 min after start") are both specified as
graded via `POST /clock`, not real elapsed time — a grader can't wait until
tomorrow morning to check a reminder fired. `backend/src/domain/clock.ts` is
a single in-memory value: `now()` returns real system time until `/clock` is
ever called, then returns exactly what it was last set/advanced to. This
also meant retrofitting BR2's cancellation fee to read from the same clock
(`cancellationService.ts`'s `now` default changed from `new Date()` to
`clock.now()`) — otherwise the app would have two different, disagreeing
notions of "now" once the clock was ever touched.

**Real-time-until-touched, not always-real-time:** once set, the clock does
*not* keep advancing with real time — it freezes at exactly the value given,
until the next `/clock` call. This is deliberate: deterministic grading
needs "it is now exactly 9:31am" to stay true for the whole request, not
drift while the request is in flight.

**In-memory, not persisted — a real trade-off, not an oversight.** The clock
(and the outbox, and the reminder-dedupe state) reset on every server
restart. For a real deployment this would be wrong; for this system, the
alternative (a DB-backed clock/settings table) is real added scope for what
is fundamentally a grading/testing hook, not a feature the front desk itself
needs. Called out explicitly rather than silently accepted: mid-build, this
surfaced as real confusion (`tsx watch` restarting on every file edit
silently reset an already-set virtual clock), which is a genuine cost of the
in-memory choice, not a bug in the clock's logic.

### T2 — No-show sweep (`noShowService.ts`, `completionService.ts`)

Required inventing a state the twist implies but doesn't fully spec:
"if not completed" presupposes a `COMPLETED` status already exists, so
`COMPLETED` and `NO_SHOW` were added to the enum alongside a minimal
`POST /appointments/:id/complete`. Without that endpoint, every `BOOKED`
appointment would eventually become `NO_SHOW` with no way to say otherwise,
which can't be the intent.

The sweep itself (`sweepNoShows`) is one `updateMany` — `WHERE status =
'BOOKED' AND starts_at <= now - 30min`, no per-row loop. It's naturally
idempotent: once a row flips to `NO_SHOW` it stops matching, so re-running
the sweep on an unchanged clock is a harmless no-op. It runs synchronously
inside `POST /clock`, not on a real background timer — there's no
"meanwhile, in real time" for a virtual clock to hand off to.

### T1 — Morning reminders (`notificationService.ts`, `reminderService.ts`)

`notificationService.ts` is a deliberately thin stand-in for a real
Notification Service: `sendNotification()` pushes to an in-memory array
instead of calling an SMS/email provider, and `GET /outbox` exposes that
array directly — the grading hook the twist names, with no mock server
needed.

**"Each morning" reinterpreted as "once per calendar day (UTC)":** the twist
doesn't pin an exact hour, and grading is clock-driven rather than
wall-clock-driven, so the sweep fires once, the first time a `POST /clock`
call's resulting time lands on a new UTC calendar day versus the last day it
ran for (`lastReminderDateKey`, module-level in-memory state) — not on any
specific hour. This is an interpretive call worth flagging explicitly: a
stricter reading ("only at ~8am") would need an hour threshold the twist
doesn't specify, and I judged the day-crossing interpretation more robust
against a grader picking an arbitrary morning timestamp.

**Manual reminders were added beyond the twist's own spec.** The automatic
sweep alone produces an outbox a human never explicitly asked to populate,
which surfaced as real confusion during development ("why am I seeing a
notification addressed to a patient?"). `GET /reminders/today` (today's
`BOOKED` appointments, flagged with whether a reminder already went out) and
`POST /reminders/:id/send` (manual, independent of the sweep) exist so the
front desk has an explicit, reviewable "who needs reminding" list with a
button, rather than only a silently-populated log — the automatic sweep
(the graded requirement) is unchanged and still fires on `/clock`.

**Two bugs worth naming, both from the same root cause** (composing a
patient-facing message on the server without pinning a timezone/frame of
reference):
1. The reminder's time-of-day was first rendered with
   `toLocaleTimeString()` with no `timeZone` option, which silently used
   the *server machine's* OS timezone rather than UTC — a 15:00 UTC
   appointment showed as "8:30 PM" on a server running in IST. Fixed by
   pinning `timeZone: "UTC"` explicitly, consistent with how the rest of
   the system treats appointment times.
2. The message text ("you have an appointment...") is correct **for the
   patient it's addressed to**, but rendering it verbatim in the front
   desk's own UI made it look self-addressed. Fixed by labeling the
   recipient explicitly ("To Samantha Lee") wherever the raw message is
   shown, rather than changing the message itself — the message needs to
   stay patient-voiced since that's what would actually be sent to them.

### Frontend for the twists

`AppointmentRow` gained Reschedule/Complete actions alongside Cancel — all
three only render for `BOOKED` appointments, matching each service's own
guard. Rescheduling can move an appointment off the currently-viewed day
entirely; `DoctorDayView` drops it from the list rather than show it under
the wrong date once that happens.

The new Clock tab (`ClockPanel.tsx`) deliberately does **not** show a live
"current server time" readout. That number is exactly the in-memory state
that resets on server restart (see above) — displaying it live meant it
could look wrong at the worst possible moment, which is precisely what
happened during development. Each action instead shows the *result* of what
just happened (sweep counts), which is always accurate for that instant
without claiming to track ongoing time. `DoctorDayView`'s date picker
similarly stopped defaulting to the browser's real today and now asks
`GET /clock` what day the server currently thinks it is — before this fix,
advancing the virtual clock while the day view still assumed real-world
"today" was its own source of the same class of confusion.

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
- **Doctor/patient CRUD beyond what booking needs** — no edit/delete
  endpoints for doctors or patients, since the workflows described don't
  call for them.
- **A real Notification Service integration** — `notificationService.ts` is
  an in-memory stand-in by design (see the T1 section above); wiring an
  actual SMS/email provider is a swap-the-implementation task, not a
  redesign, since routes/services already call `sendNotification()` as if
  it were the real thing.

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
- **Virtual clock, outbox, and reminder-dedupe state are all in-memory** —
  none of it survives a server restart. Fine for a single long-running
  deployment; a real production setup (multiple instances, deploys that
  restart the process) would need this in Postgres instead. Explained in
  full in the T1/T2 section above, since it's a design trade-off worth
  understanding, not just a bug.
- **"Once per calendar day" is an interpretation**, not a literal reading of
  "each morning" — the twist doesn't specify an hour, and I judged
  day-crossing more robust for clock-driven grading than guessing a
  threshold hour. Worth confirming against the actual grading rubric if
  that's available.
- **Reschedule and the no-show/reminder sweeps have no automated tests
  either** — same deferred-tests situation as BR1/BR2, now with three more
  time-sensitive edge cases to eventually cover: rescheduling exactly onto
  another appointment's boundary, the 30-minute no-show cutoff, and the
  day-boundary reminder dedupe (advancing the clock twice within one day
  vs. across a day boundary).

## Process note

This was built in explicit phases (domain logic → API layer → migrations/
seed → frontend, then later T6 → virtual clock → T2 → T1 → frontend for the
twists), one module generated, live-tested against the running API, and
reasoned about at a time rather than all at once — so each business rule
(and later, each twist) could be checked off deliberately instead of
discovered missing at the end. Several of the fixes described above (the
UTC timezone bug, the message-framing confusion, the clock-display removal,
`DoctorDayView`'s date-sync bug) were only found *because* of this
test-as-you-go approach, by actually exercising the running system rather
than reasoning about the code in the abstract.
