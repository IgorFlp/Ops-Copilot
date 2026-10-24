import express from "express";
import { errorHandler } from "./middleware/error-handler.js";
import { arenaRouter } from "./routes/arena-routes.js";
import { chatRouter } from "./routes/chat-routes.js";

export const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(arenaRouter);
app.use(chatRouter);
app.use(errorHandler);
