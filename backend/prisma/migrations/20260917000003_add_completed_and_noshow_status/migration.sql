-- Needed so BOOKED appointments have somewhere to go besides "cancelled":
-- COMPLETED (front desk confirms the visit happened) excludes an
-- appointment from the T2 no-show sweep; NO_SHOW is that sweep's target
-- state for anything left BOOKED too long past its start time.
ALTER TYPE "AppointmentStatus" ADD VALUE 'COMPLETED';
ALTER TYPE "AppointmentStatus" ADD VALUE 'NO_SHOW';
