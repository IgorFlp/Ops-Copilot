import { app } from "./app.js";
import { getDefaultOpsStore, closeDefaultOpsStore } from "./store/default-ops-store.js";
import { closeDefaultConversationStore } from "./store/default-conversation-store.js";
import {
  getDefaultRequestStore,
  closeDefaultRequestStore,
} from "./store/default-request-store.js";
import {
  closeDefaultMemoryStore,
  drainDefaultLearningTasks,
} from "./memory/memory-store.js";
import { seedOperationalData } from "../scripts/seed.js";

const port = Number(process.env.PORT ?? 3000);

const store = getDefaultOpsStore();
await seedOperationalData(store);
// Opening the request store eagerly runs the request-table migrations on startup.
getDefaultRequestStore();

const server = app.listen(port, () => {
  console.info(`OpsPilot listening on port ${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close((error) => {
      void drainDefaultLearningTasks()
        .then(() => {
          if (error) {
            process.stderr.write("[opspilot] HTTP server shutdown failed\n");
          }
          closeDefaultOpsStore();
          closeDefaultConversationStore();
          closeDefaultRequestStore();
          closeDefaultMemoryStore();
          process.exit(error ? 1 : 0);
        })
        .catch(() => {
          process.stderr.write("[opspilot] learning shutdown failed\n");
          closeDefaultOpsStore();
          closeDefaultConversationStore();
          closeDefaultRequestStore();
          closeDefaultMemoryStore();
          process.exitCode = 1;
        });
    });
  });
}