import { RequestHandler } from "express";
import { z } from "zod";
import { createArenaService, strategies } from "../services/arena-service.js";
import { ReasoningStrategy } from "../agents/types.js";

const arenaRequestSchema = z.object({
  input: z.string().trim().min(1).max(20_000),
  strategies: z
    .array(
      z.enum([
        "react",
        "plan-and-execute",
        "reflect:react",
        "reflect:plan-and-execute",
      ]),
    )
    .min(1)
    .max(4)
    .refine((items) => new Set(items).size === items.length, {
      message: "Strategies must be unique",
    })
    .optional(),
  maxIterations: z.number().int().min(1).max(100).optional(),
  maxReflection: z.number().int().min(0).max(100).optional(),
}).strict();

export type ArenaRequest = z.infer<typeof arenaRequestSchema>;

export function parseArenaRequest(body: unknown): ArenaRequest {
  return arenaRequestSchema.parse(body);
}

export function createArenaController(
  availableStrategies: ReasoningStrategy[] = strategies,
): RequestHandler {
  const service = createArenaService(availableStrategies);
  return async (req, res) => {
    const body = parseArenaRequest(req.body);
    const results = await service.run(body.input, {
      strategyNames: body.strategies,
      maxIterations: body.maxIterations,
      maxReflection: body.maxReflection,
    });
    res.status(200).json({
      input: body.input,
      results,
    });
  };
}
