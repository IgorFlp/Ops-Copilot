import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { closeDatabase, ensureDatabaseReady, sequelize } from "../src/models/database.js";

export async function migrateAlertSeverity(): Promise<void> {
  await ensureDatabaseReady();
  const migration = await readFile(
    new URL("./migrations/001-alert-severity.sql", import.meta.url),
    "utf8",
  );
  await sequelize.transaction(async (transaction) => {
    await sequelize.query(migration, { transaction });
  });
}

async function main(): Promise<void> {
  try {
    await migrateAlertSeverity();
    process.stdout.write("Applied alert severity migration.\n");
  } finally {
    await closeDatabase();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Alert severity migration failed: ${message}\n`);
    process.exitCode = 1;
  });
}
