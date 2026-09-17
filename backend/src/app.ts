import cors from "cors";
import express from "express";
import { appointmentsRouter } from "./routes/appointments.js";
import { doctorsRouter } from "./routes/doctors.js";
import { errorHandler } from "./routes/errorHandler.js";
import { patientsRouter } from "./routes/patients.js";

// Built as a factory (not a started server) so tests can import it directly
// with supertest instead of binding a real port.
export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/doctors", doctorsRouter);
  app.use("/patients", patientsRouter);
  app.use("/appointments", appointmentsRouter);

  app.use(errorHandler);
  return app;
}
