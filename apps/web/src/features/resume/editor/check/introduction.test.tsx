// @vitest-environment happy-dom
import { act, renderHook, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { useCheckIntroduction } from "./introduction";
afterEach(() => {
	cleanup();
	localStorage.clear();
	vi.restoreAllMocks();
});
it("persists dismissal for this user across remounts without sharing it with another user", () => {
	const first = renderHook(() => useCheckIntroduction("alice"));
	expect(first.result.current.introduced).toBe(false);
	act(() => first.result.current.setIntroduced(true));
	first.unmount();
	expect(renderHook(() => useCheckIntroduction("alice")).result.current.introduced).toBe(true);
	expect(renderHook(() => useCheckIntroduction("bob")).result.current.introduced).toBe(false);
});
it("tolerates unavailable browser storage", () => {
	vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
		throw new Error("denied");
	});
	vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
		throw new Error("denied");
	});
	const hook = renderHook(() => useCheckIntroduction("alice"));
	act(() => hook.result.current.setIntroduced(true));
	expect(hook.result.current.introduced).toBe(true);
});
