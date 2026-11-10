import type { RequestHandler } from "express";
import { z } from "zod";
import { DomainError } from "../errors/domain-error.js";
import {
  getDefaultRequestTraceService,
  type RequestTraceService,
} from "../services/request-trace-service.js";

const requestIdSchema = z.object({
  id: z.string().trim().min(1, "Request id is required"),
});

export interface RequestControllerOptions {
  requestTraceService?: RequestTraceService;
}

export function createRequestController(
  options: RequestControllerOptions = {},
): RequestHandler {
  return async (req, res, next) => {
    try {
      const { id: requestId } = requestIdSchema.parse(req.params);
      const service =
        options.requestTraceService ?? getDefaultRequestTraceService();
      const record = await service.getRequest(requestId);
      if (!record) {
        throw new DomainError("Request not found", "NOT_FOUND");
      }
      res.status(200).json(record);
    } catch (error) {
      next(error);
    }
  };
}
