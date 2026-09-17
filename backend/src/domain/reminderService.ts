import type { PrismaClient } from "@prisma/client";
import { AppointmentNotBookedError, NotFoundError } from "./errors.js";
import { getOutbox, sendNotification, type OutboxNotification } from "./notificationService.js";

/** Last calendar day (UTC, YYYY-MM-DD) the automatic morning sweep ran for. */
let lastReminderDateKey: string | null = null;

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayWindow(d: Date) {
  const dayStart = new Date(`${dateKey(d)}T00:00:00.000Z`);
  return { dayStart, dayEnd: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000) };
}

interface AppointmentWithPeople {
  id: string;
  doctorId: string;
  patientId: string;
  startsAt: Date;
  patient: { name: string };
  doctor: { name: string };
}

function buildReminder(appt: AppointmentWithPeople, now: Date): Omit<OutboxNotification, "id"> {
  // This is the message text as it would be delivered TO THE PATIENT (by
  // SMS/email in a real integration) -- addressed to them in second
  // person, with a human time, not the desk's ISO timestamp. Formatted in
  // UTC explicitly: the rest of this system treats appointment times as
  // UTC (see getDoctorDay's day-boundary convention), and without pinning
  // the timeZone here, this would silently use whatever timezone the
  // server machine happens to be running in instead.
  const time = appt.startsAt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
  return {
    type: "APPOINTMENT_REMINDER",
    appointmentId: appt.id,
    patientId: appt.patientId,
    patientName: appt.patient.name,
    doctorName: appt.doctor.name,
    appointmentStartsAt: appt.startsAt.toISOString(),
    message: `Reminder: you have an appointment with ${appt.doctor.name} today at ${time}.`,
    sentAt: now.toISOString(),
  };
}

/**
 * T1: "each morning" is interpreted as once per calendar day (UTC) -- the
 * first time the virtual clock (advanced via POST /clock) lands on a new
 * day, every BOOKED appointment scheduled that day gets a reminder sent to
 * the Notification Service. lastReminderDateKey guards against resending
 * when the clock is advanced again later the same day.
 */
export async function sweepMorningReminders(prisma: PrismaClient, now: Date) {
  const today = dateKey(now);
  if (today === lastReminderDateKey) return 0;
  lastReminderDateKey = today;

  const { dayStart, dayEnd } = dayWindow(now);
  const appointments = await prisma.appointment.findMany({
    where: { status: "BOOKED", startsAt: { gte: dayStart, lt: dayEnd } },
    include: { patient: true, doctor: true },
  });

  for (const appt of appointments) {
    sendNotification(buildReminder(appt, now));
  }

  return appointments.length;
}

/**
 * Backs the front desk's "Today's reminders" box: today's booked
 * appointments, each flagged with whether a reminder has already gone out
 * (from the automatic sweep or a previous manual send) so the desk isn't
 * guessing what still needs doing.
 */
export async function getTodaysBookedAppointments(prisma: PrismaClient, now: Date) {
  const { dayStart, dayEnd } = dayWindow(now);
  const appointments = await prisma.appointment.findMany({
    where: { status: "BOOKED", startsAt: { gte: dayStart, lt: dayEnd } },
    include: { patient: true, doctor: true },
    orderBy: { startsAt: "asc" },
  });

  const remindedIds = new Set(
    getOutbox()
      .filter((n) => n.type === "APPOINTMENT_REMINDER")
      .map((n) => n.appointmentId)
  );

  return appointments.map((appt) => ({ ...appt, reminderSent: remindedIds.has(appt.id) }));
}

/** Front desk manually sends one reminder, independent of the daily sweep. */
export async function sendManualReminder(prisma: PrismaClient, appointmentId: string, now: Date) {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { patient: true, doctor: true },
  });
  if (!appt) throw new NotFoundError("Appointment not found.");
  if (appt.status !== "BOOKED") {
    throw new AppointmentNotBookedError("Only a booked appointment can be reminded.");
  }

  return sendNotification(buildReminder(appt, now));
}
