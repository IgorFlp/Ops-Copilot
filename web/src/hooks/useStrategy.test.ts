import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useStrategy } from "./useStrategy";
import { STORAGE_KEYS } from "../lib/storage";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("useStrategy", () => {
  it("defaults to auto", () => {
    const { result } = renderHook(() => useStrategy());
    expect(result.current.strategy).toBe("auto");
  });

  it("persists and restores the selected route", () => {
    const first = renderHook(() => useStrategy());
    act(() => first.result.current.setStrategy("team"));
    expect(first.result.current.strategy).toBe("team");
    expect(window.localStorage.getItem(STORAGE_KEYS.strategy)).toBe("team");
    first.unmount();

    const second = renderHook(() => useStrategy());
    expect(second.result.current.strategy).toBe("team");
  });

  it("ignores an invalid stored value", () => {
    window.localStorage.setItem(STORAGE_KEYS.strategy, "nope");
    const { result } = renderHook(() => useStrategy());
    expect(result.current.strategy).toBe("auto");
  });
});
