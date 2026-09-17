import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import {
  AlreadyCancelledError,
  BookingConflictError,
  InvalidRangeError,
  NotFoundError,
} from "../domain/errors.js";

/**
 * Single place mapping domain/validation errors to HTTP status codes, so
 * individual route handlers stay free of repeated try/catch + status logic.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Invalid request.", details: err.issues });
  }
  if (err instanceof InvalidRangeError) {
    return res.status(400).json({ error: err.message });
  }
  if (err instanceof NotFoundError) {
    return res.status(404).json({ error: err.message });
  }
  if (err instanceof BookingConflictError || err instanceof AlreadyCancelledError) {
    return res.status(409).json({ error: err.message });
  }

  console.error("Unhandled error:", err);
  return res.status(500).json({ error: "Internal server error." });
}

/** Wraps an async route handler so rejected promises reach errorHandler. */
export function asyncRoute(
  fn: (req: Request, res: Response) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
