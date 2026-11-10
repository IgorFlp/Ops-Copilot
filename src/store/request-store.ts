export type RequestStatus = "completed" | "failed";

export interface RequestRecord {
  requestId: string;
  userId: string;
  conversationId: string | null;
  strategy: string | null;
  modelUsed: string | null;
  status: RequestStatus;
  errorCode: string | null;
  calls: number | null;
  latencyMs: number | null;
  historyMessages: number | null;
  promptTokens: number | null;
  contextBreakdown: Record<string, number> | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}

export interface TraceEventEntry {
  position: number;
  node: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt?: string;
}

export interface RequestTrace {
  request: RequestRecord;
  trace: TraceEventEntry[];
}

export interface RequestStore {
  saveRequest(
    record: RequestRecord,
    trace: readonly TraceEventEntry[],
  ): Promise<void>;
  getRequest(requestId: string): Promise<RequestTrace | null>;
  listRequestsSince(since: string): Promise<RequestRecord[]>;
  close(): void;
}
