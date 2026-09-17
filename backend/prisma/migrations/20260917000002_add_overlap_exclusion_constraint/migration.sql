-- btree_gist lets a GiST index/constraint use an equality operator on a
-- plain (non-range) column like doctor_id, which EXCLUDE below needs.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- The actual "no doctor is ever double-booked" guarantee (BR1). Two
-- appointments for the same doctor can never both exist as BOOKED if their
-- [starts_at, ends_at) ranges intersect -- enforced by Postgres itself, so
-- it holds even if two requests race past the application-level check in
-- bookingService.ts. Cancelled appointments are excluded via the WHERE
-- clause: a cancelled slot must not block rebooking that time.
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING gist (
    "doctor_id" WITH =,
    tsrange("starts_at", "ends_at") WITH &&
  )
  WHERE ("status" = 'BOOKED');
