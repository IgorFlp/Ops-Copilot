import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { DomainError } from "../errors/domain-error.js";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Invalid request",
      issues: error.issues.map(({ path, message }) => ({ path, message })),
    });
    return;
  }

  if (error instanceof DomainError) {
    const status =
      error.code === "NOT_FOUND"
        ? 404
        : error.code === "CONFLICT"
          ? 409
          : error.code === "CONFIGURATION"
            ? 500
            : 400;
    res.status(status).json({ error: error.message });
    return;
  }

  console.error("Unhandled request error", error);
  res.status(500).json({ error: "Internal server error" });
};
