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

	it("retains cached session when getSession encounters a transient error on refresh", async () => {
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

		const context = await loadRootContext(queryClient);
		expect(context.session).toEqual(cachedSession);
	});

	it("re-throws error when getSession fails and there is no cached session", async () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		getSessionMock.mockRejectedValueOnce(new Error("Session check failed with status 500"));

		await expect(loadRootContext(queryClient)).rejects.toThrow("Session check failed with status 500");
	});
});
