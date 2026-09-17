export interface TimeRange {
  startsAt: Date;
  endsAt: Date;
}

/**
 * Two half-open intervals [start, end) overlap iff each starts before the
 * other ends. A slot ending exactly when another starts does NOT overlap
 * (back-to-back bookings are allowed).
 */
export function intervalsOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

export function isValidRange(range: TimeRange): boolean {
  return range.startsAt < range.endsAt;
}

/**
 * Application-level guard used inside a DB transaction before insert.
 * This is defense-in-depth only — the real guarantee against races is the
 * `appointments_no_overlap` EXCLUDE constraint in the database (see
 * prisma/migrations/*_add_overlap_exclusion_constraint). Two concurrent
 * requests can both pass this check before either commits; only the DB
 * constraint can guarantee just one of them survives.
 */
export function findOverlapping<T extends TimeRange>(
  candidate: TimeRange,
  existing: T[]
): T | undefined {
  return existing.find((appt) => intervalsOverlap(candidate, appt));
}

/** Name of the DB-level EXCLUDE constraint (see prisma/migrations). */
export const OVERLAP_CONSTRAINT_NAME = "appointments_no_overlap";

/**
 * Recognizes a Postgres EXCLUDE-constraint violation bubbling up through
 * Prisma so both bookAppointment and rescheduleAppointment can translate it
 * into the same BookingConflictError, whether the conflict was caught by
 * the app-level check or only by the DB under a race.
 */
export function isOverlapConstraintViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const message = "message" in err ? String((err as { message: unknown }).message) : "";
  const meta = (err as { meta?: { message?: string; code?: string } }).meta;
  return (
    message.includes(OVERLAP_CONSTRAINT_NAME) ||
    message.includes("23P01") ||
    meta?.message?.includes(OVERLAP_CONSTRAINT_NAME) === true
  );
}
