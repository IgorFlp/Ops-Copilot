import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { DomainError } from "../errors/domain-error.js";

function isMalformedJsonError(
  error: unknown,
): error is { status: 400; type: "entity.parse.failed" } {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 400 &&
    "type" in error &&
    error.type === "entity.parse.failed"
  );
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Invalid request",
      issues: error.issues.map(({ path, message }) => ({ path, message })),
    });
    return;
  }

  if (isMalformedJsonError(error)) {
    res.status(400).json({
      error: "Invalid request",
      issues: [{ path: [], message: "Malformed JSON body" }],
    });
    return;
  }

  if (error instanceof DomainError) {
    if (error.code === "INTERNAL") {
      res.status(500).json({ error: "Internal server error" });
      return;
    }
    if (error.code === "TIMEOUT") {
      res.status(504).json({ error: "Request timed out" });
      return;
    }
    const status =
      error.code === "NOT_FOUND"
        ? 404
        : error.code === "CONFLICT"
          ? 409
          : error.code === "UNSUPPORTED_STRATEGY"
            ? 422
            : error.code === "CONFIGURATION"
              ? 500
              : 400;
    res.status(status).json({ error: error.message });
    return;
  }

  console.error("Unhandled request error", error);
  res.status(500).json({ error: "Internal server error" });
};
