import express from "express";
import path from "node:path";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/error-handler.js";
import { registerWebStatic, WEB_BASE_PATH } from "./middleware/web-static.js";
import { arenaRouter } from "./routes/arena-routes.js";
import { chatRouter } from "./routes/chat-routes.js";
import { requestRouter } from "./routes/request-routes.js";
import { statsRouter } from "./routes/stats-routes.js";

export const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(corsMiddleware);
app.use(arenaRouter);
app.use(chatRouter);
app.use(requestRouter);
app.use(statsRouter);

const webStatic = registerWebStatic(path.resolve(process.cwd(), "web/dist"));
if (webStatic) {
  app.use(WEB_BASE_PATH, webStatic);
}

app.use(errorHandler);
