import type { PrismaClient } from "@prisma/client";
import { isValidRange, findOverlapping } from "./overlap.js";
import { BookingConflictError, InvalidRangeError, NotFoundError } from "./errors.js";

export interface BookAppointmentInput {
  doctorId: string;
  patientId: string;
  startsAt: Date;
  endsAt: Date;
}

/** Name of the DB-level EXCLUDE constraint (see prisma/migrations). */
const OVERLAP_CONSTRAINT_NAME = "appointments_no_overlap";

/**
 * Books an appointment for a doctor.
 *
 * Two layers guard against double-booking:
 *  1. An application-level overlap check inside the transaction — fails
 *     fast with a clear error for the common case (no real concurrency).
 *  2. A Postgres EXCLUDE USING gist constraint on (doctor_id, time range)
 *     — this is the actual source of truth. If two requests race past
 *     layer 1 simultaneously, only one INSERT can ever commit; the other
 *     fails the DB constraint and we translate that into the same
 *     BookingConflictError.
 *
 * This means "no doctor is ever double-booked" holds even under
 * concurrent requests, not just in the common single-request case.
 */
export async function bookAppointment(
  prisma: PrismaClient,
  input: BookAppointmentInput
) {
  if (!isValidRange({ startsAt: input.startsAt, endsAt: input.endsAt })) {
    throw new InvalidRangeError();
  }

  const [doctor, patient] = await Promise.all([
    prisma.doctor.findUnique({ where: { id: input.doctorId } }),
    prisma.patient.findUnique({ where: { id: input.patientId } }),
  ]);
  if (!doctor) throw new NotFoundError("Doctor not found.");
  if (!patient) throw new NotFoundError("Patient not found.");

  try {
    return await prisma.$transaction(async (tx) => {
      const sameDayWindow = await tx.appointment.findMany({
        where: {
          doctorId: input.doctorId,
          status: "BOOKED",
          startsAt: { lt: input.endsAt },
          endsAt: { gt: input.startsAt },
        },
      });

      const conflict = findOverlapping(
        { startsAt: input.startsAt, endsAt: input.endsAt },
        sameDayWindow
      );
      if (conflict) throw new BookingConflictError();

      return tx.appointment.create({
        data: {
          doctorId: input.doctorId,
          patientId: input.patientId,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        },
        include: { doctor: true, patient: true },
      });
    });
  } catch (err) {
    if (isOverlapConstraintViolation(err)) {
      throw new BookingConflictError();
    }
    throw err;
  }
}

function isOverlapConstraintViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const message = "message" in err ? String((err as { message: unknown }).message) : "";
  const meta = (err as { meta?: { message?: string; code?: string } }).meta;
  return (
    message.includes(OVERLAP_CONSTRAINT_NAME) ||
    message.includes("23P01") ||
    meta?.message?.includes(OVERLAP_CONSTRAINT_NAME) === true
  );
}
