import { arenaService } from "./services/arena-service.js";
import { closeDatabase } from "./models/database.js";
import { ensureSeededServices } from "./services/service-fixtures.js";
import {
  formatArenaResults,
  parseArenaCliArguments,
} from "./arena-cli.js";

async function main(): Promise<void> {
  const options = parseArenaCliArguments(process.argv.slice(2));
  try {
    await ensureSeededServices();
    const results = await arenaService.run(options.input, {
      strategyNames: options.strategies,
      maxIterations: options.maxIterations,
      maxReflection: options.maxReflection,
    });
    process.stdout.write(`${formatArenaResults(results)}\n`);
  } finally {
    await closeDatabase();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Arena failed: ${message}\n`);
  process.exitCode = 1;
});
