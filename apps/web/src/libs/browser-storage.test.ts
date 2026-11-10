// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { browserStorage, clearPersonalStorage, onPersonalStorageCleared, storageKey } from "./browser-storage";
beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
});
it("clears every registered personal namespace from both storage areas, preserving device preferences", () => {
	for (const name of [
		"resumeBackup",
		"letterSender",
		"debriefDraft",
		"notesDraft",
		"coachContext",
		"coachOffers",
		"memoryDismissed",
		"offersPair",
		"newDocuments",
		"followUpDismissed",
	] as const) {
		for (const storage of [browserStorage.local, browserStorage.session])
			storage.setItem(storageKey(name, "alice:document"), "private");
	}
	browserStorage.local.setItem(storageKey("sidebar", "alice"), "collapsed");
	clearPersonalStorage();
	expect(sessionStorage.length).toBe(0);
	expect(Object.keys(localStorage)).toEqual([storageKey("sidebar", "alice")]);
});
it("rejects a new personal key until its scope is registered", () => {
	// @ts-expect-error Unregistered names cannot compile; runtime validation guards untyped integrations.
	expect(() => browserStorage.local.setItem("unregistered-personal", "private")).toThrow("Unregistered");
});
it("keeps a career draft only under its owner's namespace for same-account reauthentication", () => {
	browserStorage.session.setItem(storageKey("careerDraft", "alice", "master:entry"), "alice draft");
	clearPersonalStorage();
	expect(browserStorage.session.getItem(storageKey("careerDraft", "alice", "master:entry"))).toBe("alice draft");
	expect(browserStorage.session.getItem(storageKey("careerDraft", "bob", "master:entry"))).toBeNull();
	expect(() => storageKey("careerDraft", "", "master:entry")).toThrow("authenticated owner");
});
it("clears all private runtimes even if one persistence adapter is blocked", () => {
	const disposed = vi.fn();
	const stopBlocked = onPersonalStorageCleared(() => {
		throw new DOMException("Blocked storage", "SecurityError");
	});
	const stopDisposed = onPersonalStorageCleared(disposed);
	try {
		expect(() => clearPersonalStorage()).not.toThrow();
		expect(disposed).toHaveBeenCalledOnce();
	} finally {
		stopBlocked();
		stopDisposed();
	}
});
