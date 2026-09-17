import type { PrismaClient } from "@prisma/client";

/**
 * Returns every appointment for a doctor on a given calendar day, earliest
 * first. `day` is treated as UTC midnight; the window is [day, day + 24h).
 * Includes cancelled appointments too, so the desk can see history for
 * that slot (not just what's currently booked).
 */
export async function getDoctorDay(
  prisma: PrismaClient,
  doctorId: string,
  day: Date
) {
  const dayStart = new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate())
  );
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  return prisma.appointment.findMany({
    where: {
      doctorId,
      startsAt: { gte: dayStart, lt: dayEnd },
    },
    include: { patient: true },
    orderBy: { startsAt: "asc" },
  });
}

/**
 * Case-insensitive partial match on patient name, e.g. "sam" finds
 * "Samantha Lee". Front desk staff rarely know the exact spelling.
 */
export async function findAppointmentsByPatientName(
  prisma: PrismaClient,
  name: string
) {
  return prisma.appointment.findMany({
    where: {
      patient: { name: { contains: name, mode: "insensitive" } },
    },
    include: { doctor: true, patient: true },
    orderBy: { startsAt: "asc" },
  });
}
