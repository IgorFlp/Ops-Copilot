import { Sequelize } from "sequelize";
import { DomainError } from "../errors/domain-error.js";

const databaseUrl = process.env.DATABASE_URL;

export const sequelize = databaseUrl
  ? new Sequelize(databaseUrl, {
      dialect: "postgres",
      logging: false,
      password:
        process.env.PGPASSWORD ||
        decodeURIComponent(new URL(databaseUrl).password),
    })
  : new Sequelize(
      process.env.PGDATABASE ?? "ops_pilot",
      process.env.PGUSER ?? "postgres",
      process.env.PGPASSWORD ?? "",
      {
        dialect: "postgres",
        host: process.env.PGHOST ?? "127.0.0.1",
        port: Number(process.env.PGPORT ?? 5432),
        logging: false,
      },
    );

let ready: Promise<void> | undefined;

export function ensureDatabaseReady(): Promise<void> {
  ready ??= (async () => {
    const urlPassword = databaseUrl
      ? new URL(databaseUrl).password
      : "";
    if (!process.env.PGPASSWORD && !urlPassword) {
      throw new DomainError(
        "Configure PGPASSWORD or include credentials in DATABASE_URL",
        "CONFIGURATION",
      );
    }
    await sequelize.authenticate();
    await sequelize.sync();
  })().catch((error: unknown) => {
    ready = undefined;
    throw error;
  });
  return ready;
}

export async function closeDatabase(): Promise<void> {
  ready = undefined;
  await sequelize.close();
}
