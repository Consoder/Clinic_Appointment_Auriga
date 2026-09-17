import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prismaClient.js";
import { clock } from "../domain/clock.js";
import { sweepNoShows } from "../domain/noShowService.js";
import { sweepMorningReminders } from "../domain/reminderService.js";
import { asyncRoute } from "./errorHandler.js";

export const clockRouter = Router();

const clockSchema = z.union([
  z.object({ now: z.string().datetime() }),
  z.object({ advanceMinutes: z.number().int() }),
]);

// Drives the virtual clock forward so time-based automation (T2's no-show
// sweep, T1's morning reminders) can be graded deterministically instead of
// waiting on real time to pass. Sweep jobs run synchronously here, so
// results are visible immediately in the response and in subsequent GETs
// (e.g. /outbox) -- no real background scheduler needed for this to work.
clockRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const input = clockSchema.parse(req.body);
    const newNow =
      "now" in input
        ? clock.set(new Date(input.now))
        : clock.advance(input.advanceMinutes * 60 * 1000);

    const noShowCount = await sweepNoShows(prisma, newNow);
    const reminderCount = await sweepMorningReminders(prisma, newNow);

    res.json({ now: newNow.toISOString(), noShowCount, reminderCount });
  })
);

// Companion read endpoint -- lets the desk (or a grader) check the
// server's current effective time without guessing from side effects.
clockRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    res.json({ now: clock.now().toISOString() });
  })
);
