import type { RequestHandler } from "express";

export interface CorsOptions {
  allowedOrigins: string[];
}

const CORS_METHODS = "GET, POST, OPTIONS";
const CORS_HEADERS = "Content-Type, X-Request-Id";

const DEV_DEFAULT_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

export function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function resolveAllowedOrigins(
  env: { CORS_ALLOWED_ORIGINS?: string; NODE_ENV?: string } = process.env,
): string[] {
  const configured = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);
  if (configured.length > 0) return configured;
  if (env.NODE_ENV === "production") return [];
  return DEV_DEFAULT_ORIGINS;
}

export function createCorsMiddleware(options: CorsOptions): RequestHandler {
  const allowed = new Set(options.allowedOrigins);

  return (req, res, next) => {
    const origin = req.headers.origin;
    res.setHeader("Vary", "Origin");

    if (typeof origin === "string" && allowed.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", CORS_METHODS);
      res.setHeader("Access-Control-Allow-Headers", CORS_HEADERS);
      res.setHeader("Access-Control-Max-Age", "600");
    }

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  };
}

export const corsMiddleware = createCorsMiddleware({
  allowedOrigins: resolveAllowedOrigins(),
});
