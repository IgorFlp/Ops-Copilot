import express, { type Router } from "express";
import { existsSync } from "node:fs";
import path from "node:path";

export const WEB_BASE_PATH = "/opspilot";

function hasFileExtension(urlPath: string): boolean {
  const lastSegment = urlPath.split("/").pop() ?? "";
  return lastSegment.includes(".");
}

export function createWebStaticRouter(distDir: string): Router {
  const router = express.Router();

  router.use(express.static(distDir));
  router.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    if (hasFileExtension(req.path)) {
      next();
      return;
    }
    res.sendFile("index.html", { root: distDir });
  });

  return router;
}

export function registerWebStatic(distDir: string): Router | null {
  if (!existsSync(path.join(distDir, "index.html"))) {
    return null;
  }
  return createWebStaticRouter(distDir);
}
