# Clinic Appointment System

A front-desk tool for a small clinic: book patients into time slots, guarantee
a doctor is never double-booked, apply a fair cancellation fee rule, and let
the desk find a doctor's day or a patient's appointment quickly.

See [`REASONING.md`](./REASONING.md) for design rationale, trade-offs, and
what's deliberately left out.

## Business rules

| # | Rule |
|---|------|
| BR1 | No two `BOOKED` appointments for the same doctor may have overlapping time ranges. Back-to-back appointments (one ends exactly when the next starts) are allowed. |
| BR2 | Cancelling **≥ 24 hours** before the appointment start is free. Cancelling later incurs a flat late fee. Cancelling exactly at the 24h boundary counts as free. (Numbers are placeholders in `backend/src/domain/fee.ts` — change `CANCELLATION_POLICY` if the real clinic policy differs.) |
| BR3 | The desk can view a doctor's full day of appointments, sorted by time. |
| BR4 | The desk can find an appointment by patient name (partial, case-insensitive). |

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
      overlap.ts                  # BR1 interval math
      bookingService.ts           # BR1 booking + conflict handling
      fee.ts                      # BR2 fee rule (pure function)
      cancellationService.ts      # BR2 cancellation flow
      lookupService.ts            # BR3 + BR4 read queries
      errors.ts                   # typed domain errors
    db/prismaClient.ts             # Prisma client singleton
    routes/                        # Express routers (HTTP layer)
      appointments.ts
      doctors.ts
      patients.ts
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
      AppointmentRow.tsx           # shared row + cancel action (BR2)
    App.tsx                        # 3-tab layout: Book / Doctor's Day / Find Patient
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
