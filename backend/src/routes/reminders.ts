import { Router } from "express";
import { prisma } from "../db/prismaClient.js";
import { clock } from "../domain/clock.js";
import { getTodaysBookedAppointments, sendManualReminder } from "../domain/reminderService.js";
import { asyncRoute } from "./errorHandler.js";

export const remindersRouter = Router();

// Today's booked appointments, flagged with whether a reminder already
// went out -- the front desk's reviewable "who needs reminding" list.
remindersRouter.get(
  "/today",
  asyncRoute(async (_req, res) => {
    const appointments = await getTodaysBookedAppointments(prisma, clock.now());
    res.json(appointments);
  })
);

// Manual send, independent of the once-a-day automatic sweep -- the desk
// decides who gets reminded and when, not just the clock.
remindersRouter.post(
  "/:appointmentId/send",
  asyncRoute(async (req, res) => {
    const notification = await sendManualReminder(prisma, req.params.appointmentId, clock.now());
    res.status(201).json(notification);
  })
);
