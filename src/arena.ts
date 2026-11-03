import { arenaService } from "./services/arena-service.js";
import {
  closeDefaultOpsStore,
  getDefaultOpsStore,
} from "./store/default-ops-store.js";
import { seedOperationalData } from "../scripts/seed.js";
import {
  formatArenaResults,
  parseArenaCliArguments,
} from "./arena-cli.js";

async function main(): Promise<void> {
  const options = parseArenaCliArguments(process.argv.slice(2));
  try {
    await seedOperationalData(getDefaultOpsStore());
    const results = await arenaService.run(options.input, {
      strategyNames: options.strategies,
      maxIterations: options.maxIterations,
      maxReflection: options.maxReflection,
    });
    process.stdout.write(`${formatArenaResults(results)}\n`);
  } finally {
    closeDefaultOpsStore();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Arena failed: ${message}\n`);
  process.exitCode = 1;
});
