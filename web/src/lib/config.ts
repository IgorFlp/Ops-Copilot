export const BASE_PATH: string = import.meta.env.BASE_URL ?? "/";

export const DEFAULT_USER_ID: string =
  import.meta.env.VITE_USER_ID?.trim() || "operator-1";

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function isValidBaseUrl(url: string): boolean {
  const normalized = normalizeBaseUrl(url);
  if (normalized.length === 0) return false;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export const DEFAULT_API_BASE_URL = "http://localhost:3000";

export function defaultApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured && isValidBaseUrl(configured)) {
    return normalizeBaseUrl(configured);
  }
  if (
    typeof window !== "undefined" &&
    window.location?.port === "3000" &&
    window.location.origin
  ) {
    return normalizeBaseUrl(window.location.origin);
  }
  return DEFAULT_API_BASE_URL;
}
