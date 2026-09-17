import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prismaClient.js";
import { bookAppointment } from "../domain/bookingService.js";
import { cancelAppointment } from "../domain/cancellationService.js";
import { completeAppointment } from "../domain/completionService.js";
import { rescheduleAppointment } from "../domain/rescheduleService.js";
import { asyncRoute } from "./errorHandler.js";

export const appointmentsRouter = Router();

const bookSchema = z.object({
  doctorId: z.string().min(1),
  patientId: z.string().min(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

// BR1: bookAppointment enforces the no-overlap rule; conflicts surface as 409
// via errorHandler, not as a raw 500.
appointmentsRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const input = bookSchema.parse(req.body);
    const appointment = await bookAppointment(prisma, {
      doctorId: input.doctorId,
      patientId: input.patientId,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
    });
    res.status(201).json(appointment);
  })
);

// BR2: cancelAppointment decides free vs. late fee based on the server's
// clock at the moment of cancellation, not a client-supplied timestamp
// (the front desk can't be trusted to send an honest "now").
appointmentsRouter.post(
  "/:id/cancel",
  asyncRoute(async (req, res) => {
    const appointment = await cancelAppointment(prisma, {
      appointmentId: req.params.id,
    });
    res.json(appointment);
  })
);

const rescheduleSchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

// T6: same doctor, same patient -- the body intentionally has no doctorId/
// patientId fields, only the new time range. BR1 is re-checked against
// every other booked appointment for this doctor.
appointmentsRouter.post(
  "/:id/reschedule",
  asyncRoute(async (req, res) => {
    const input = rescheduleSchema.parse(req.body);
    const appointment = await rescheduleAppointment(prisma, {
      appointmentId: req.params.id,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
    });
    res.json(appointment);
  })
);

// T2: marks a visit as having happened, which excludes it from the
// automatic no-show sweep triggered by POST /clock.
appointmentsRouter.post(
  "/:id/complete",
  asyncRoute(async (req, res) => {
    const appointment = await completeAppointment(prisma, req.params.id);
    res.json(appointment);
  })
);
