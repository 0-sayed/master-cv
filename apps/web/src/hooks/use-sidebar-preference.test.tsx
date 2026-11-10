// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useSidebarPreference } from "./use-sidebar-preference";

describe("account-scoped sidebar preference", () => {
	beforeEach(() => {
		localStorage.clear();
	});
	it("reads a saved collapse before the first render and persists expansion", () => {
		localStorage.setItem("master-cv:sidebar:user-1", "collapsed");
		const { result, unmount } = renderHook(() => useSidebarPreference("user-1"));
		expect(result.current.collapsed).toBe(true);
		act(() => result.current.toggle());
		expect(result.current.collapsed).toBe(false);
		unmount();
		expect(renderHook(() => useSidebarPreference("user-1")).result.current.collapsed).toBe(false);
	});
	it("does not apply one user's preference to another account", () => {
		localStorage.setItem("master-cv:sidebar:user-1", "collapsed");
		const { result, rerender } = renderHook(({ id }) => useSidebarPreference(id), { initialProps: { id: "user-1" } });
		expect(result.current.collapsed).toBe(true);
		rerender({ id: "user-2" });
		expect(result.current.collapsed).toBe(false);
	});
	it("keeps the toggle usable when browser storage is unavailable", () => {
		const blocked = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("Storage disabled");
		});
		const { result } = renderHook(() => useSidebarPreference("private-window"));
		act(() => result.current.toggle());
		expect(result.current.collapsed).toBe(true);
		blocked.mockRestore();
	});
});
