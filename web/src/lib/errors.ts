export type ApiErrorCode =
  | "VALIDATION"
  | "UNSUPPORTED_STRATEGY"
  | "NOT_FOUND"
  | "CONFLICT"
  | "TIMEOUT"
  | "MODEL_UNAVAILABLE"
  | "INTERNAL"
  | "NETWORK";

export interface ValidationIssue {
  path: (string | number)[];
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly issues: ValidationIssue[];

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    issues: ValidationIssue[] = [],
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

export function codeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return "VALIDATION";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 422:
      return "UNSUPPORTED_STRATEGY";
    case 503:
      return "MODEL_UNAVAILABLE";
    case 504:
      return "TIMEOUT";
    default:
      return "INTERNAL";
  }
}

export function messageForCode(code: ApiErrorCode, fallback: string): string {
  switch (code) {
    case "VALIDATION":
      return "The request was rejected. Check the message and try again.";
    case "UNSUPPORTED_STRATEGY":
      return "The requested strategy is not supported.";
    case "NOT_FOUND":
      return "The requested resource was not found.";
    case "CONFLICT":
      return "This action is no longer available.";
    case "TIMEOUT":
      return "The request timed out. Try again.";
    case "MODEL_UNAVAILABLE":
      return "The model provider is unavailable. Try again shortly.";
    case "NETWORK":
      return "Could not reach the API. Check the API URL in settings.";
    case "INTERNAL":
    default:
      return fallback;
  }
}
