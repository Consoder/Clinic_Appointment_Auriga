# Clinic Appointment System

A front-desk tool for a small clinic: book patients into time slots, guarantee
a doctor is never double-booked, apply a fair cancellation fee rule, let the
desk find a doctor's day or a patient's appointment quickly, reschedule an
appointment without reopening the double-booking problem, and automatically
handle no-shows and morning reminders.

See [`REASONING.md`](./REASONING.md) for design rationale, trade-offs, and
what's deliberately left out.

## Business rules

| # | Rule |
|---|------|
| BR1 | No two `BOOKED` appointments for the same doctor may have overlapping time ranges. Back-to-back appointments (one ends exactly when the next starts) are allowed. |
| BR2 | Cancelling **≥ 24 hours** before the appointment start is free. Cancelling later incurs a flat late fee. Cancelling exactly at the 24h boundary counts as free. (Numbers are placeholders in `backend/src/domain/fee.ts` — change `CANCELLATION_POLICY` if the real clinic policy differs.) |
| BR3 | The desk can view a doctor's full day of appointments, sorted by time. |
| BR4 | The desk can find an appointment by patient name (partial, case-insensitive). |
| T6 | An appointment can be **rescheduled** to a new time, re-checking BR1 against every other appointment for that doctor. Same doctor, same patient — only the time changes. Only a currently `BOOKED` appointment can be rescheduled. |
| T2 | Any appointment still `BOOKED` more than **30 minutes** past its start time is automatically marked `NO_SHOW`, unless the desk has marked it `COMPLETED` first. Runs as a sweep whenever the clock advances (see below). |
| T1 | Each morning (once per calendar day, UTC), every `BOOKED` appointment scheduled that day gets a reminder sent to a Notification Service. The desk can also send one manually at any time from the "Today's appointments" box. |

Since T1 and T2 are both time-driven, the backend runs on a **virtual clock**
instead of only real wall-clock time — see [`POST /clock`](#post-clock) below
and [Why a virtual clock](./REASONING.md#why-a-virtual-clock) in REASONING.md.

## Tech stack

- **Backend:** Node.js 22 + TypeScript + Express + Prisma ORM
- **Database:** PostgreSQL 16 (via Docker Compose), with a `EXCLUDE USING gist`
  constraint enforcing BR1 at the database level — see [Why the DB enforces
  BR1](./REASONING.md#why-the-database-enforces-br1)
- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Validation:** Zod (request body/query validation on the API)

## Project structure

```
backend/
  prisma/
    schema.prisma                 # Doctor, Patient, Appointment models
    migrations/                   # SQL migrations, incl. the overlap constraint
    seed.ts                       # sample doctors + patients
  src/
    domain/                       # pure/service logic, no HTTP concerns
      overlap.ts                  # BR1 interval math + shared constraint-violation check
      bookingService.ts           # BR1 booking + conflict handling
      rescheduleService.ts        # T6 reschedule + conflict handling
      fee.ts                      # BR2 fee rule (pure function)
      cancellationService.ts      # BR2 cancellation flow
      completionService.ts        # T2 mark-completed (excludes from no-show sweep)
      noShowService.ts            # T2 no-show sweep
      clock.ts                    # virtual clock (POST /clock reads/writes this)
      notificationService.ts      # in-memory outbox "Notification Service"
      reminderService.ts          # T1 morning sweep + manual reminder send
      lookupService.ts            # BR3 + BR4 read queries
      errors.ts                   # typed domain errors
    db/prismaClient.ts             # Prisma client singleton
    routes/                        # Express routers (HTTP layer)
      appointments.ts             # book, cancel, reschedule, complete
      doctors.ts
      patients.ts
      clock.ts                    # GET/POST /clock
      outbox.ts                   # GET /outbox
      reminders.ts                # GET /reminders/today, POST /reminders/:id/send
      errorHandler.ts             # maps domain/validation errors -> HTTP codes
    app.ts                         # Express app factory (testable, no listen())
    server.ts                      # entry point
docker-compose.yml                 # Postgres 16 container
frontend/
  src/
    api.ts                         # typed fetch client
    types.ts
    components/
      BookingForm.tsx              # BR1 booking UI
      DoctorDayView.tsx            # BR3
      PatientSearchView.tsx        # BR4
      PatientPicker.tsx            # find-or-create patient
      AppointmentRow.tsx           # shared row: cancel/reschedule/complete actions
      ClockPanel.tsx               # advance/jump clock, today's reminders, outbox log
    App.tsx                        # 4-tab layout: Book / Doctor's Day / Find Patient / Clock
```

## Getting started

### Prerequisites

- Node.js 22+
- Docker Desktop running

### 1. Start Postgres

```bash
docker compose up -d
```

> The container maps to host port **5433**, not 5432 — this avoids
> conflicting with any Postgres already installed locally. If 5433 is also
> taken on your machine, change the port in `docker-compose.yml` and
> `backend/.env`.

### 2. Backend

```bash
cd backend
npm install
copy .env.example .env        # (macOS/Linux: cp .env.example .env)
npx prisma migrate deploy     # applies schema + the overlap constraint
npm run seed                  # sample doctors & patients
npm run dev                   # http://localhost:3000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

### Running tests

```bash
cd backend
npm test
```

(Test suite is a planned next phase — see `REASONING.md`.)

## API contract

All responses are JSON. All errors follow `{ "error": "message" }` (validation
errors additionally include a `details` array from Zod).

### `GET /health`

Liveness check.

**200**
```json
{ "ok": true }
```

---

### `GET /doctors`

List all doctors.

**200**
```json
[
  { "id": "uuid", "name": "Dr. Asha Rao", "specialty": "General Physician" }
]
```

---

### `GET /doctors/:id/day?date=YYYY-MM-DD`

BR3. Returns that doctor's appointments for the given calendar day (UTC),
earliest first, including cancelled ones (so the desk sees history for that
slot, not just what's currently booked).

**Query params**
- `date` (required) — `YYYY-MM-DD`

**200**
```json
[
  {
    "id": "uuid",
    "doctorId": "uuid",
    "patientId": "uuid",
    "startsAt": "2026-09-20T10:00:00.000Z",
    "endsAt": "2026-09-20T10:30:00.000Z",
    "status": "BOOKED",
    "cancelledAt": null,
    "feeCharged": false,
    "patient": { "id": "uuid", "name": "Samantha Lee", "phone": "555-0101" }
  }
]
```

**400** — missing/malformed `date`

---

### `POST /patients`

Register a new patient.

**Body**
```json
{ "name": "Samantha Lee", "phone": "555-0101" }
```
`phone` is optional.

**201**
```json
{ "id": "uuid", "name": "Samantha Lee", "phone": "555-0101" }
```

**400** — validation error (e.g. missing `name`)

---

### `GET /patients?name=`

Search patient *records* by name (used by the booking form's patient
picker — distinct from `/patients/search`, which searches appointments).

**200**
```json
[{ "id": "uuid", "name": "Samantha Lee", "phone": "555-0101" }]
```
(max 10 results)

---

### `GET /patients/search?name=`

BR4. Find appointments by patient name (partial, case-insensitive), across
all doctors.

**200** — array of `Appointment`, each including its `doctor` and `patient`.

**400** — missing `name` query param

---

### `POST /appointments`

BR1. Book an appointment.

**Body**
```json
{
  "doctorId": "uuid",
  "patientId": "uuid",
  "startsAt": "2026-09-20T10:00:00.000Z",
  "endsAt": "2026-09-20T10:30:00.000Z"
}
```
`startsAt`/`endsAt` are ISO 8601 datetime strings.

**201** — the created `Appointment`, including `doctor` and `patient`.

**400** — invalid range (`startsAt >= endsAt`) or validation error

**404** — `doctorId` or `patientId` does not exist

**409** — conflict: this doctor already has an overlapping `BOOKED`
appointment in that range. This is guaranteed correct even under concurrent
requests — see [Why the database enforces BR1](./REASONING.md#why-the-database-enforces-br1).

---

### `POST /appointments/:id/cancel`

BR2. Cancels an appointment. The fee decision is based on the **server's**
clock at the moment of cancellation, not a client-supplied timestamp.

**201 / 200**
```json
{
  "id": "uuid",
  "status": "CANCELLED_LATE",
  "feeCharged": true,
  "cancelledAt": "2026-09-19T09:00:00.000Z",
  "...": "..."
}
```
`status` is `CANCELLED_FREE` or `CANCELLED_LATE`; `feeCharged` mirrors that.

**404** — appointment not found

**409** — appointment is already cancelled

---

### `POST /appointments/:id/reschedule`

T6. Moves an appointment to a new time. Same doctor, same patient — the body
has no `doctorId`/`patientId` fields, only the new range. Re-runs BR1's
overlap check against every other `BOOKED` appointment for this doctor.

**Body**
```json
{ "startsAt": "2026-09-21T14:00:00.000Z", "endsAt": "2026-09-21T14:30:00.000Z" }
```

**200** — the updated `Appointment`.

**400** — invalid range or validation error

**404** — appointment not found

**409** — either the appointment isn't currently `BOOKED` (can't reschedule a
cancelled/completed/no-show appointment), or the new time overlaps another
booked appointment for this doctor.

---

### `POST /appointments/:id/complete`

T2. Marks a visit as having happened. This is what excludes an appointment
from the automatic no-show sweep.

**200** — the updated `Appointment` (`status: "COMPLETED"`).

**404** — appointment not found

**409** — appointment isn't currently `BOOKED`

---

### `GET /clock`

Returns the server's current effective time — real system time until
`POST /clock` is ever called, the exact value it was last set/advanced to
after that.

**200**
```json
{ "now": "2026-09-17T10:00:00.000Z" }
```

---

### `POST /clock`

Drives the virtual clock so T1/T2's time-based automation can be graded
deterministically instead of waiting on real time to pass. Accepts either an
absolute time or a relative advance. Runs the no-show sweep and the
once-per-day morning-reminder sweep synchronously before responding, so
results are visible immediately (in the response, and in subsequent
`GET /outbox` / `GET /reminders/today` calls).

**Body** — one of:
```json
{ "now": "2026-09-21T09:00:00.000Z" }
```
```json
{ "advanceMinutes": 30 }
```

**200**
```json
{ "now": "2026-09-21T09:00:00.000Z", "noShowCount": 1, "reminderCount": 2 }
```
`noShowCount` — appointments auto-marked `NO_SHOW` this tick. `reminderCount`
— reminders auto-sent this tick (0 unless this tick crossed into a new
calendar day that hadn't been swept yet).

**400** — body matches neither shape

---

### `GET /outbox`

T1. The Notification Service's outbox — every reminder "sent" (in-memory
log; a real integration would call an email/SMS provider here instead).

**200** — array of notifications:
```json
[
  {
    "id": "1",
    "type": "APPOINTMENT_REMINDER",
    "appointmentId": "uuid",
    "patientId": "uuid",
    "patientName": "Samantha Lee",
    "doctorName": "Dr. Asha Rao",
    "appointmentStartsAt": "2026-09-21T15:00:00.000Z",
    "message": "Reminder: you have an appointment with Dr. Asha Rao today at 3:00 PM.",
    "sentAt": "2026-09-21T09:00:00.000Z"
  }
]
```
`message` is written **to the patient** (second person) — it's the text a
real SMS/email would contain, not a note to the desk. Formatted in UTC
regardless of server machine timezone, matching how appointment times are
stored throughout this system.

---

### `GET /reminders/today`

Today's (per the server's current clock) `BOOKED` appointments, each
annotated with whether a reminder has already gone out — backs the front
desk's reviewable "who needs reminding" list.

**200** — array of `Appointment` plus `reminderSent: boolean`.

---

### `POST /reminders/:appointmentId/send`

Manually sends one reminder, independent of the once-a-day automatic sweep.

**201** — the created notification (same shape as an `/outbox` entry).

**404** — appointment not found

**409** — appointment isn't currently `BOOKED`
