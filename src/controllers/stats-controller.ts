import type { RequestHandler } from "express";
import { z } from "zod";
import {
  getDefaultStatsService,
  SINCE_MESSAGE,
  SINCE_PATTERN,
  type StatsService,
} from "../services/stats-service.js";

const statsQuerySchema = z.object({
  since: z
    .string({ error: "since is required" })
    .regex(SINCE_PATTERN, SINCE_MESSAGE),
});

export interface StatsControllerOptions {
  statsService?: StatsService;
}

export function createStatsController(
  options: StatsControllerOptions = {},
): RequestHandler {
  return async (req, res, next) => {
    try {
      const { since } = statsQuerySchema.parse(req.query);
      const service = options.statsService ?? getDefaultStatsService();
      const stats = await service.getStats(since);
      res.status(200).json(stats);
    } catch (error) {
      next(error);
    }
  };
}
