import { Router } from "express";
import {
  createRequestController,
  type RequestControllerOptions,
} from "../controllers/request-controller.js";

export function createRequestRouter(
  options: RequestControllerOptions = {},
): Router {
  const router = Router();
  router.get("/requests/:id", createRequestController(options));
  return router;
}

export const requestRouter = createRequestRouter();
