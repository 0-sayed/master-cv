import { describe, expect, it, vi } from "vite-plus/test";
import { QueryClient } from "@tanstack/react-query";
import { loadRootContext, sessionQueryKey } from "./root-context";

const getSessionMock = vi.hoisted(() => vi.fn());
const flagsGetMock = vi.hoisted(() => vi.fn().mockResolvedValue({ disableSignups: false, disableEmailAuth: false }));
const getLocaleMock = vi.hoisted(() => vi.fn((saved?: string) => saved ?? "ar-SA"));

vi.mock("./auth/session", () => ({
	getSession: getSessionMock,
}));

vi.mock("./locale", () => ({
	getLocale: getLocaleMock,
	loadLocale: vi.fn().mockResolvedValue(undefined),
	loadUiLocale: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./orpc/client", () => ({
	client: {
		flags: {
			get: flagsGetMock,
		},
	},
}));

vi.mock("./theme", () => ({
	getTheme: () => "system",
}));

describe("loadRootContext", () => {
	it.each([null, { user: { id: "bob" }, session: { id: "bob-session" } }])(
		"removes private caches when the authenticated account changes to %j",
		async (next) => {
			const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
			queryClient.setQueryData(sessionQueryKey, { user: { id: "alice" }, session: { id: "alice-session" } });
			queryClient.setQueryData(["documents"], [{ id: "private-alice" }]);
			await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
			getSessionMock.mockResolvedValueOnce(next);
			expect((await loadRootContext(queryClient)).session).toEqual(next);
			expect(queryClient.getQueryData(["documents"])).toBeUndefined();
		},
	);
	it("resolves interface locale from the fetched session and reuses the cached session for hover loads", async () => {
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		getSessionMock.mockResolvedValueOnce({
			user: { id: "locale-user", uiLocale: "en-US" },
			session: { id: "locale-session" },
		});
		const context = await loadRootContext(queryClient);
		expect(context.locale).toBe("en-US");
		expect(getLocaleMock).toHaveBeenLastCalledWith("en-US");
		getSessionMock.mockClear();
		await loadRootContext(queryClient);
		expect(getSessionMock).not.toHaveBeenCalled();
	});
	it("loads root context with freshly fetched session", async () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const mockSession = {
			user: { id: "user-1", name: "Alice" },
			session: { id: "sess-1" },
		};
		getSessionMock.mockResolvedValueOnce(mockSession);

		const context = await loadRootContext(queryClient);
		expect(context.session).toEqual(mockSession);
	});

	it("rejects an unverifiable identity instead of retaining private cached identity", async () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const cachedSession = {
			user: { id: "user-1", name: "Alice" },
			session: { id: "sess-1" },
		};
		queryClient.setQueryData(sessionQueryKey, cachedSession);
		// Mark stale/invalid so getSession is invoked
		void queryClient.invalidateQueries({ queryKey: sessionQueryKey });

		getSessionMock.mockRejectedValueOnce(new Error("Too many requests. Please try again later."));

		await expect(loadRootContext(queryClient)).rejects.toThrow("Too many requests");
		expect(queryClient.getQueryData(sessionQueryKey)).toBeUndefined();
	});

	it("re-throws error when getSession fails and there is no cached session", async () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		getSessionMock.mockRejectedValueOnce(new Error("Session check failed with status 500"));

		await expect(loadRootContext(queryClient)).rejects.toThrow("Session check failed with status 500");
	});
});

it("concurrent hover and navigation accept the same new identity without a router error", async () => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const session = { user: { id: "concurrent-sign-in", uiLocale: "en-US" }, session: { id: "new-session" } };
	getSessionMock.mockResolvedValue(session);
	const results = await Promise.all([loadRootContext(client), loadRootContext(client)]);
	expect(results.map((context) => context.session)).toEqual([session, session]);
});

it("re-reads a cancelled generation without exposing the previous owner or a route error", async () => {
	const { authIdentity } = await import("./auth/identity");
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const next = { user: { id: "current-owner" }, session: { id: "current-session" } };
	let resolve!: (value: typeof next) => void;
	getSessionMock
		.mockImplementationOnce(
			() =>
				new Promise((accept) => {
					resolve = accept;
				}),
		)
		.mockResolvedValue(next);
	const pending = loadRootContext(client);
	authIdentity(client).check();
	resolve({ user: { id: "obsolete-owner" }, session: { id: "obsolete-session" } });
	await expect(pending).resolves.toMatchObject({ session: next });
});
