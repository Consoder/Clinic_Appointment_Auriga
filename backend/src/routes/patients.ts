import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prismaClient.js";
import { findAppointmentsByPatientName } from "../domain/lookupService.js";
import { asyncRoute } from "./errorHandler.js";

export const patientsRouter = Router();

const createPatientSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
});

// Front desk registers a new patient before booking their first appointment.
patientsRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const data = createPatientSchema.parse(req.body);
    const patient = await prisma.patient.create({ data });
    res.status(201).json(patient);
  })
);

const nameQuerySchema = z.object({
  name: z.string().min(1, "name query param is required"),
});

// Patient picker for the booking form: find an existing patient record
// itself (not their appointments) so the desk can attach a new booking to
// them instead of accidentally creating a duplicate patient.
patientsRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const { name } = nameQuerySchema.parse(req.query);
    const patients = await prisma.patient.findMany({
      where: { name: { contains: name, mode: "insensitive" } },
      orderBy: { name: "asc" },
      take: 10,
    });
    res.json(patients);
  })
);

// BR4: find a patient's appointment by name, without needing their patient ID.
patientsRouter.get(
  "/search",
  asyncRoute(async (req, res) => {
    const { name } = nameQuerySchema.parse(req.query);
    const appointments = await findAppointmentsByPatientName(prisma, name);
    res.json(appointments);
  })
);
