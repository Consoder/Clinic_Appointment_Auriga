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
