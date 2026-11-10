// @vitest-environment happy-dom
import type { AuthSession } from "@reactive-resume/auth/types";
import { beforeEach, expect, it } from "vite-plus/test";
import { QueryClient } from "@tanstack/react-query";
import { browserStorage, clearPersonalStorage, runPersonalRequest, storageKey } from "../browser-storage";
import { authIdentity, sessionQueryKey } from "./identity";
const session = (id: string) => ({ user: { id }, session: { id: `${id}-session` } }) as AuthSession;
beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
});
it("hides private state immediately on a cross-tab notification and clears all previous-owner state on confirmation", () => {
	const client = new QueryClient();
	client.setQueryData(sessionQueryKey, session("alice"));
	client.setQueryData(["documents"], ["alice-private"]);
	browserStorage.session.setItem(storageKey("coachContext", "alice:job"), "private");
	const identity = authIdentity(client);
	identity.check();
	expect(identity.snapshot().status).toBe("checking");
	expect(client.getQueryData(["documents"])).toBeUndefined();
	identity.accept(session("bob"));
	expect(identity.snapshot()).toMatchObject({ status: "confirmed", session: { user: { id: "bob" } } });
	expect(browserStorage.session.getItem(storageKey("coachContext", "alice:job"))).toBeNull();
	expect(browserStorage.session.getItem(storageKey("identityOwner"))).toBe("bob");
	expect(identity.snapshot().generation).toBeGreaterThan(0);
});
it("preserves matching owner drafts across a full reload", () => {
	authIdentity(new QueryClient()).accept(session("alice"));
	browserStorage.local.setItem(storageKey("notesDraft", "alice:job"), "draft");
	authIdentity(new QueryClient()).accept(session("alice"));
	expect(browserStorage.local.getItem(storageKey("notesDraft", "alice:job"))).toBe("draft");
});
it("clears an inactive tab's private drafts after another tab changed the shared owner", () => {
	browserStorage.local.setItem(storageKey("identityOwner"), "bob");
	browserStorage.session.setItem(storageKey("identityOwner"), "alice");
	browserStorage.session.setItem(storageKey("coachContext", "thread"), "alice private context");
	authIdentity(new QueryClient()).accept(session("bob"));
	expect(browserStorage.session.getItem(storageKey("coachContext", "thread"))).toBeNull();
});
it("does not let an older session response restore a previous identity generation", () => {
	const identity = authIdentity(new QueryClient());
	identity.accept(session("alice"));
	const obsolete = identity.snapshot().generation;
	identity.check();
	identity.accept(session("bob"));
	expect(identity.accept(session("alice"), obsolete)).toBe(false);
	expect(identity.snapshot()).toMatchObject({ status: "confirmed", session: { user: { id: "bob" } } });
});
it("rejects a late previous-generation RPC even when the transport ignores cancellation", async () => {
	let resolve!: (value: string) => void;
	const pending = runPersonalRequest(
		() =>
			new Promise<string>((accept) => {
				resolve = accept;
			}),
	);
	clearPersonalStorage();
	resolve("private old account response");
	await expect(pending).rejects.toMatchObject({ name: "AbortError" });
});
it("discards an old owner's error response after identity cancellation", async () => {
	let reject!: (error: Error) => void;
	const pending = runPersonalRequest(
		() =>
			new Promise<void>((_resolve, fail) => {
				reject = fail;
			}),
	);
	clearPersonalStorage();
	reject(new Error("Previous owner's private server error"));
	await expect(pending).rejects.toMatchObject({ name: "AbortError" });
});
