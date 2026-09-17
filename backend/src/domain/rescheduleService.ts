import type { PrismaClient } from "@prisma/client";
import { isValidRange, findOverlapping, isOverlapConstraintViolation } from "./overlap.js";
import {
  AppointmentNotBookedError,
  BookingConflictError,
  InvalidRangeError,
  NotFoundError,
} from "./errors.js";

export interface RescheduleInput {
  appointmentId: string;
  startsAt: Date;
  endsAt: Date;
}

/**
 * T6: moves an appointment to a new time slot. Same doctor, same patient —
 * the request body only carries the new times, there's nothing to reassign.
 * Re-runs BR1's overlap guard against every OTHER booked appointment for
 * this doctor (the same two-layer app-check + DB EXCLUDE-constraint
 * guarantee bookAppointment relies on — Postgres naturally excludes a row
 * from checking against itself during UPDATE, so no self-exclusion trick
 * is needed on the DB side).
 */
export async function rescheduleAppointment(
  prisma: PrismaClient,
  input: RescheduleInput
) {
  if (!isValidRange({ startsAt: input.startsAt, endsAt: input.endsAt })) {
    throw new InvalidRangeError();
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.appointment.findUnique({
        where: { id: input.appointmentId },
      });
      if (!existing) throw new NotFoundError("Appointment not found.");

      // Only an active booking makes sense to move; a cancelled/no-show/
      // completed appointment is history, not something to reschedule.
      if (existing.status !== "BOOKED") {
        throw new AppointmentNotBookedError();
      }

      const others = await tx.appointment.findMany({
        where: {
          doctorId: existing.doctorId,
          status: "BOOKED",
          id: { not: existing.id },
          startsAt: { lt: input.endsAt },
          endsAt: { gt: input.startsAt },
        },
      });

      const conflict = findOverlapping(
        { startsAt: input.startsAt, endsAt: input.endsAt },
        others
      );
      if (conflict) throw new BookingConflictError();

      return tx.appointment.update({
        where: { id: existing.id },
        data: { startsAt: input.startsAt, endsAt: input.endsAt },
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
