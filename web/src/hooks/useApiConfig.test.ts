import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useApiConfigState } from "./useApiConfig";
import { STORAGE_KEYS } from "../lib/storage";

beforeEach(() => {
  window.localStorage.clear();
});

describe("useApiConfig", () => {
  it("initializes with the provided value", () => {
    const { result } = renderHook(() =>
      useApiConfigState("http://initial.test"),
    );
    expect(result.current.baseUrl).toBe("http://initial.test");
  });

  it("restores a stored valid URL on init", () => {
    window.localStorage.setItem(STORAGE_KEYS.apiBaseUrl, "http://stored.test");
    const { result } = renderHook(() => useApiConfigState());
    expect(result.current.baseUrl).toBe("http://stored.test");
  });

  it("rejects an invalid URL and keeps the previous value", () => {
    const { result } = renderHook(() =>
      useApiConfigState("http://initial.test"),
    );

    let outcome: { ok: boolean } = { ok: true };
    act(() => {
      outcome = result.current.saveBaseUrl("not a url");
    });

    expect(outcome.ok).toBe(false);
    expect(result.current.baseUrl).toBe("http://initial.test");
  });

  it("saves, normalizes and persists a valid URL", () => {
    const { result } = renderHook(() =>
      useApiConfigState("http://initial.test"),
    );

    act(() => {
      result.current.saveBaseUrl("http://new.test/");
    });

    expect(result.current.baseUrl).toBe("http://new.test");
    expect(window.localStorage.getItem(STORAGE_KEYS.apiBaseUrl)).toBe(
      "http://new.test",
    );
  });
});
