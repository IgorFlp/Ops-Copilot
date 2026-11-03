import { app } from "./app.js";
import { getDefaultOpsStore, closeDefaultOpsStore } from "./store/default-ops-store.js";
import { seedOperationalData } from "../scripts/seed.js";

const port = Number(process.env.PORT ?? 3000);

const store = getDefaultOpsStore();
await seedOperationalData(store);

const server = app.listen(port, () => {
  console.info(`OpsPilot listening on port ${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => {
      closeDefaultOpsStore();
      process.exit(0);
    });
  });
}