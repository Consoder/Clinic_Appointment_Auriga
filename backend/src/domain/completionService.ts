import type { PrismaClient } from "@prisma/client";
import { AppointmentNotBookedError, NotFoundError } from "./errors.js";

/**
 * Front desk confirms a visit actually happened. This is what excludes an
 * appointment from T2's automatic no-show sweep -- without it, every past
 * appointment would eventually become NO_SHOW with no way to say otherwise.
 */
export async function completeAppointment(prisma: PrismaClient, appointmentId: string) {
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment) throw new NotFoundError("Appointment not found.");

  if (appointment.status !== "BOOKED") {
    throw new AppointmentNotBookedError(
      "Only a currently booked appointment can be marked completed."
    );
  }

  return prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: "COMPLETED" },
    include: { doctor: true, patient: true },
  });
}
