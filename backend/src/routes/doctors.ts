import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prismaClient.js";
import { getDoctorDay } from "../domain/lookupService.js";
import { asyncRoute } from "./errorHandler.js";

export const doctorsRouter = Router();

// Front desk needs to pick a doctor from a list before booking/viewing a day.
doctorsRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    const doctors = await prisma.doctor.findMany({ orderBy: { name: "asc" } });
    res.json(doctors);
  })
);

const dayQuerySchema = z.object({
  // Expecting YYYY-MM-DD; anything else is a client error, not a 500.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
});

doctorsRouter.get(
  "/:id/day",
  asyncRoute(async (req, res) => {
    const { date } = dayQuerySchema.parse(req.query);
    const day = new Date(`${date}T00:00:00.000Z`);
    const appointments = await getDoctorDay(prisma, req.params.id, day);
    res.json(appointments);
  })
);
