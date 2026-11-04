export interface MemoryRecord {
  id: number;
  userId: string;
  fact: string;
  embedding: Float32Array;
  createdAt: string;
}

export interface MemoryStore {
  all(userId: string): Promise<MemoryRecord[]>;
  create(
    userId: string,
    fact: string,
    embedding: Float32Array,
  ): Promise<MemoryRecord>;
  replace(
    userId: string,
    memoryId: number,
    fact: string,
    embedding: Float32Array,
  ): Promise<boolean>;
  delete(userId: string, memoryId: number): Promise<boolean>;
  close(): void;
}
