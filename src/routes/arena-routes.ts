import { Router } from "express";
import { createArenaController } from "../controllers/arena-controller.js";

export const arenaRouter = Router();

arenaRouter.post("/arena", createArenaController());
