import { Router } from "express";
import {
  createStatsController,
  type StatsControllerOptions,
} from "../controllers/stats-controller.js";

export function createStatsRouter(
  options: StatsControllerOptions = {},
): Router {
  const router = Router();
  router.get("/stats", createStatsController(options));
  return router;
}

export const statsRouter = createStatsRouter();
