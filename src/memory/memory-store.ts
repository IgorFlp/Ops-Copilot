import { embed } from "./embeddings.js";
import { createLearningExtractor, resolveCorrection } from "../agents/learning-reflector.js";
import {
  createLearningReflector,
  type LearningReflector,
} from "../services/learning-reflector.js";
import { LearningTaskRunner } from "../services/learning-task-runner.js";
import { MemoryService } from "../services/memory-service.js";
import { SqliteMemoryStore } from "../store/sqlite-memory-store.js";

let defaultStore: SqliteMemoryStore | undefined;
let defaultService: MemoryService | undefined;
let defaultLearningReflector: LearningReflector | undefined;
let defaultLearningTaskRunner: LearningTaskRunner | undefined;

export function getDefaultMemoryService(): MemoryService {
  defaultStore ??= new SqliteMemoryStore();
  defaultService ??= new MemoryService(defaultStore, embed);
  return defaultService;
}

export function getDefaultLearningReflector(): LearningReflector {
  defaultLearningReflector ??= createLearningReflector(
    getDefaultMemoryService(),
    createLearningExtractor(),
    resolveCorrection,
  );
  return defaultLearningReflector;
}

export function getDefaultLearningTaskRunner(): LearningTaskRunner {
  defaultLearningTaskRunner ??= new LearningTaskRunner();
  return defaultLearningTaskRunner;
}

export async function drainDefaultLearningTasks(): Promise<void> {
  await defaultLearningTaskRunner?.drain();
}

export function closeDefaultMemoryStore(): void {
  defaultStore?.close();
  defaultStore = undefined;
  defaultService = undefined;
  defaultLearningReflector = undefined;
}
