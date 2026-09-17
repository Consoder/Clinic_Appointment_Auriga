import type { PrismaClient } from "@prisma/client";
import { decideCancellationFee } from "./fee.js";
import { AlreadyCancelledError, NotFoundError } from "./errors.js";

export interface CancelAppointmentInput {
  appointmentId: string;
  /** Injectable so the 24h boundary is deterministically testable. */
  now?: Date;
}

export async function cancelAppointment(
  prisma: PrismaClient,
  { appointmentId, now = new Date() }: CancelAppointmentInput
) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
  });
  if (!appointment) throw new NotFoundError("Appointment not found.");

  // A cancelled appointment can't be cancelled again — its fee outcome is final.
  if (appointment.status !== "BOOKED") {
    throw new AlreadyCancelledError();
  }

  const outcome = decideCancellationFee(now, appointment.startsAt);

  return prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status: outcome.kind === "FREE" ? "CANCELLED_FREE" : "CANCELLED_LATE",
      feeCharged: outcome.kind === "LATE_FEE",
      cancelledAt: now,
    },
    include: { doctor: true, patient: true },
  });
}
