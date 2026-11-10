import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  defaultApiBaseUrl,
  isValidBaseUrl,
  normalizeBaseUrl,
} from "../lib/config";
import { STORAGE_KEYS, readStorage, writeStorage } from "../lib/storage";

export interface SaveResult {
  ok: boolean;
  error?: string;
}

export interface ApiConfigValue {
  baseUrl: string;
  saveBaseUrl(url: string): SaveResult;
}

const INVALID_URL_MESSAGE = "Enter a valid http(s) URL.";

function initialBaseUrl(): string {
  const stored = readStorage(STORAGE_KEYS.apiBaseUrl);
  if (stored && isValidBaseUrl(stored)) {
    return normalizeBaseUrl(stored);
  }
  return defaultApiBaseUrl();
}

export function useApiConfigState(initial?: string): ApiConfigValue {
  const [baseUrl, setBaseUrl] = useState<string>(() => initial ?? initialBaseUrl());

  const saveBaseUrl = useCallback((url: string): SaveResult => {
    if (!isValidBaseUrl(url)) {
      return { ok: false, error: INVALID_URL_MESSAGE };
    }
    const normalized = normalizeBaseUrl(url);
    writeStorage(STORAGE_KEYS.apiBaseUrl, normalized);
    setBaseUrl(normalized);
    return { ok: true };
  }, []);

  return useMemo(() => ({ baseUrl, saveBaseUrl }), [baseUrl, saveBaseUrl]);
}

const ApiConfigContext = createContext<ApiConfigValue | null>(null);

export function ApiConfigProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: string;
}): ReactNode {
  const value = useApiConfigState(initial);
  return (
    <ApiConfigContext.Provider value={value}>
      {children}
    </ApiConfigContext.Provider>
  );
}

export function useApiConfig(): ApiConfigValue {
  const context = useContext(ApiConfigContext);
  if (!context) {
    throw new Error("useApiConfig must be used within ApiConfigProvider");
  }
  return context;
}
