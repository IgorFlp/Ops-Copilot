import type {
  CorrectionInput,
  CorrectionResolution,
  LearningExtractor,
} from "../agents/learning-reflector.js";
import { correctionResolutionSchema, parseLearningResult } from "../agents/learning-reflector.js";
import type { Memory } from "./memory-service.js";

export interface LearningMemoryService {
  remember(userId: string, fact: string): Promise<Memory>;
  recall(userId: string, query: string, k?: number): Promise<Memory[]>;
  replace(userId: string, memoryId: number, fact: string): Promise<Memory>;
}

export interface LearningReflector {
  prepareCorrection(
    userId: string,
    latestUserMessage: string,
  ): Promise<CorrectionPreparation>;
  learn(
    userId: string,
    latestUserMessage: string,
    correction?: CorrectionPreparation,
  ): Promise<void>;
}

export type CorrectionPreparation =
  | { kind: "none" }
  | { kind: "replace"; memoryId: number; fact: string }
  | { kind: "ambiguous" };

export type CorrectionDecision = CorrectionResolution;
export type ResolveCorrection = (
  input: CorrectionInput,
) => Promise<CorrectionDecision>;

const explicitCorrectionPattern =
  /\b(?:actually|correction|correcting|i meant|instead|not anymore|na verdade|corrigindo|corre[cç][aã]o|quis dizer|não,|nao,|agora prefiro)\b/i;

const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /-----BEGIN PGP PRIVATE KEY BLOCK-----/i,
  /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*\S{4,}/i,
  /\b(?:api[_ -]?key|token|password|secret|credential)\s+(?:is\s+)?["']?[A-Za-z0-9_./+=-]{12,}/i,
  /\bBearer\s+[A-Za-z0-9._~+/-]{12,}/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/i,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
];

export function containsSensitiveCredential(value: string): boolean {
  return secretPatterns.some((pattern) => pattern.test(value));
}

function isExplicitCorrection(message: string): boolean {
  return explicitCorrectionPattern.test(message);
}

export function createLearningReflector(
  memory: LearningMemoryService,
  extract: LearningExtractor,
  resolve: ResolveCorrection,
): LearningReflector {
  async function prepareCorrection(
    userId: string,
    latestUserMessage: string,
  ): Promise<CorrectionPreparation> {
    if (!userId.trim() || !latestUserMessage.trim()) {
      throw new TypeError("userId and latestUserMessage must not be empty");
    }
    if (
      !isExplicitCorrection(latestUserMessage) ||
      containsSensitiveCredential(latestUserMessage)
    ) {
      return { kind: "none" };
    }

    const candidate = parseLearningResult(
      await extract(latestUserMessage),
    );
    if (!candidate.hasLearning || containsSensitiveCredential(candidate.fact)) {
      return { kind: "none" };
    }

    const memories = await memory.recall(
      userId,
      candidate.fact,
      Number.MAX_SAFE_INTEGER,
    );
    const resolution = correctionResolutionSchema.parse(
      await resolve({
        userMessage: latestUserMessage,
        candidateFact: candidate.fact,
        memories: memories.map(({ id, fact }) => ({ id, fact })),
      }),
    );
    if (resolution.kind === "ambiguous") {
      return { kind: "ambiguous" };
    }
    if (resolution.kind !== "correction") return { kind: "none" };
    const selected = memories.filter(
      ({ id }) => id === resolution.supersededMemoryId,
    );
    if (selected.length !== 1) return { kind: "ambiguous" };
    return {
      kind: "replace",
      memoryId: selected[0].id,
      fact: candidate.fact,
    };
  }

  return {
    prepareCorrection,
    async learn(userId, latestUserMessage, correction) {
      if (!userId.trim() || !latestUserMessage.trim()) {
        throw new TypeError("userId and latestUserMessage must not be empty");
      }
      if (correction?.kind === "ambiguous") return;
      const preparedCorrection =
        correction ??
        (isExplicitCorrection(latestUserMessage)
          ? await prepareCorrection(userId, latestUserMessage)
          : undefined);
      if (preparedCorrection?.kind === "ambiguous") return;
      if (preparedCorrection?.kind === "replace") {
        await memory.replace(
          userId,
          preparedCorrection.memoryId,
          preparedCorrection.fact,
        );
        return;
      }
      if (containsSensitiveCredential(latestUserMessage)) return;

      const candidate = parseLearningResult(
        await extract(latestUserMessage),
      );
      if (!candidate.hasLearning || containsSensitiveCredential(candidate.fact)) {
        return;
      }
      if (isExplicitCorrection(latestUserMessage)) return;

      await memory.remember(userId, candidate.fact);
    },
  };
}
