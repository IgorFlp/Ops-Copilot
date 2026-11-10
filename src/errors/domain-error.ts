export type DomainErrorCode =
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION"
  | "CONFIGURATION"
  | "UNSUPPORTED_STRATEGY"
  | "TIMEOUT"
  | "INTERNAL"
  | "MODEL_UNAVAILABLE";

export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: DomainErrorCode,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
