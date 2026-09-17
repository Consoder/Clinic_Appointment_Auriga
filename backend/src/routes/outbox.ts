import { Router } from "express";
import { getOutbox } from "../domain/notificationService.js";
import { asyncRoute } from "./errorHandler.js";

export const outboxRouter = Router();

// Grading/inspection endpoint for T1 -- exposes what the Notification
// Service "sent" instead of requiring a real email/SMS integration.
outboxRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    res.json(getOutbox());
  })
);
