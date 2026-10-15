import { app } from "./app.js";
import { ensureDatabaseReady } from "./models/database.js";

const port = Number(process.env.PORT ?? 3000);

await ensureDatabaseReady();

app.listen(port, () => {
  console.info(`OpsPilot listening on port ${port}`);
});