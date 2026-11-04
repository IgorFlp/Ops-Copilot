import { DomainError } from "../errors/domain-error.js";
import type { Embedder } from "../memory/embeddings.js";
import { EMBEDDING_DIMENSIONS } from "../memory/embeddings.js";
import type { MemoryRecord, MemoryStore } from "../store/memory-store.js";

export const MEMORY_DEDUPE_THRESHOLD = 0.92;
export const MEMORY_RECALL_THRESHOLD = 0.3;
export const DEFAULT_MEMORY_RECALL_LIMIT = 3;

export function isRecallScoreRelevant(score: number): boolean {
  return score > MEMORY_RECALL_THRESHOLD;
}

export interface Memory {
  id: number;
  userId: string;
  fact: string;
  createdAt: string;
  score?: number;
}

export interface MemoryRecall {
  recall(userId: string, query: string, k?: number): Promise<Memory[]>;
}

export type ForgetPreferenceResult =
  | { status: "forgotten"; memoryId: number }
  | { status: "not_found" }
  | { status: "ambiguous" };

function dot(left: Float32Array, right: Float32Array): number {
  if (
    left.length !== EMBEDDING_DIMENSIONS ||
    right.length !== EMBEDDING_DIMENSIONS
  ) {
    throw new DomainError(
      `Embeddings must contain ${EMBEDDING_DIMENSIONS} values`,
      "VALIDATION",
    );
  }
  let score = 0;
  for (let index = 0; index < EMBEDDING_DIMENSIONS; index += 1) {
    score += left[index] * right[index];
  }
  return score;
}

function publicMemory(record: MemoryRecord): Memory {
  return {
    id: record.id,
    userId: record.userId,
    fact: record.fact,
    createdAt: record.createdAt,
  };
}

export class MemoryService implements MemoryRecall {
  private readonly userLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly store: MemoryStore,
    private readonly embed: Embedder,
  ) {}

  async remember(userId: string, fact: string): Promise<Memory> {
    this.validateText(userId, "userId");
    this.validateText(fact, "fact");
    const owner = userId.trim();
    const normalizedFact = fact.trim();
    const embedding = await this.embed(normalizedFact);
    return this.withUserLock(owner, async () => {
      const existing = await this.store.all(owner);
      const duplicate = existing.find(
        (memory) =>
          dot(embedding, memory.embedding) > MEMORY_DEDUPE_THRESHOLD,
      );
      if (duplicate) return publicMemory(duplicate);
      return publicMemory(
        await this.store.create(owner, normalizedFact, embedding),
      );
    });
  }

  async recall(
    userId: string,
    query: string,
    k = DEFAULT_MEMORY_RECALL_LIMIT,
  ): Promise<Memory[]> {
    this.validateText(userId, "userId");
    this.validateText(query, "query");
    if (!Number.isSafeInteger(k) || k < 1) {
      throw new DomainError("Recall limit k must be a positive safe integer", "VALIDATION");
    }

    const owner = userId.trim();
    const queryEmbedding = await this.embed(query.trim());
    const memories = await this.store.all(owner);
    return memories
      .map((memory) => ({
        ...publicMemory(memory),
        score: dot(queryEmbedding, memory.embedding),
      }))
      .filter((memory) => isRecallScoreRelevant(memory.score))
      .sort((left, right) => {
        const scoreOrder = right.score - left.score;
        return scoreOrder || left.id - right.id;
      })
      .slice(0, k);
  }

  async forget(userId: string, memoryId: number): Promise<void> {
    this.validateText(userId, "userId");
    const owner = userId.trim();
    const deleted = await this.store.delete(owner, memoryId);
    if (!deleted) {
      throw new DomainError("Memory not found", "NOT_FOUND");
    }
  }

  async replace(
    userId: string,
    memoryId: number,
    fact: string,
  ): Promise<Memory> {
    this.validateText(userId, "userId");
    this.validateText(fact, "fact");
    if (!Number.isSafeInteger(memoryId) || memoryId < 1) {
      throw new DomainError(
        "Memory identifier must be a positive safe integer",
        "VALIDATION",
      );
    }
    const owner = userId.trim();
    const normalizedFact = fact.trim();
    const embedding = await this.embed(normalizedFact);
    const replaced = await this.store.replace(
      owner,
      memoryId,
      normalizedFact,
      embedding,
    );
    if (!replaced) {
      throw new DomainError("Memory not found", "NOT_FOUND");
    }
    const memory = (await this.store.all(owner)).find(
      (record) => record.id === memoryId,
    );
    if (!memory) {
      throw new DomainError("Replaced memory could not be retrieved", "INTERNAL");
    }
    return publicMemory(memory);
  }

  async forgetPreference(
    userId: string,
    preference: string,
  ): Promise<ForgetPreferenceResult> {
    this.validateText(userId, "userId");
    this.validateText(preference, "preference");
    const matches = await this.recall(
      userId.trim(),
      preference.trim(),
      Number.MAX_SAFE_INTEGER,
    );
    if (matches.length === 0) return { status: "not_found" };
    if (matches.length !== 1) return { status: "ambiguous" };
    await this.forget(userId.trim(), matches[0].id);
    return { status: "forgotten", memoryId: matches[0].id };
  }

  private validateText(value: string, field: string): void {
    if (typeof value !== "string" || !value.trim()) {
      throw new DomainError(`${field} must not be empty`, "VALIDATION");
    }
  }

  private async withUserLock<T>(
    userId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.userLocks.get(userId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queue = previous.then(() => current);
    this.userLocks.set(userId, queue);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.userLocks.get(userId) === queue) {
        this.userLocks.delete(userId);
      }
    }
  }
}
