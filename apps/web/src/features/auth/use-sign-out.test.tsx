// @vitest-environment happy-dom
import type { AuthSession } from "@reactive-resume/auth/types";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { QueryClient } from "@tanstack/react-query";
import { useSignOut } from "./use-sign-out";
import { authIdentity, sessionQueryKey } from "@/libs/auth/identity";

const mocks = vi.hoisted(() => ({
	client: null as QueryClient | null,
	signOut: vi.fn(),
	getSession: vi.fn(),
	router: { navigate: vi.fn(), invalidate: vi.fn() },
}));
vi.mock("@tanstack/react-query", async (original) => ({
	...(await original<typeof import("@tanstack/react-query")>()),
	useQueryClient: () => mocks.client,
}));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => mocks.router }));
vi.mock("@/features/locale/provider", () => ({ useUiLocale: () => ({ locale: "en-US" }) }));
vi.mock("@/libs/auth/client", () => ({ authClient: { signOut: mocks.signOut } }));
vi.mock("@/libs/auth/session", () => ({ getSession: mocks.getSession }));
beforeEach(() => {
	vi.clearAllMocks();
	mocks.client = new QueryClient();
	mocks.client.setQueryData(sessionQueryKey, { user: { id: "owner" } } as AuthSession);
	mocks.client.setQueryData(["private"], "owner data");
	mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
	mocks.router.invalidate.mockResolvedValue(undefined);
	mocks.router.navigate.mockResolvedValue(undefined);
});
it("hides private state before revoking the session and goes directly to localized sign-in", async () => {
	const client = mocks.client;
	if (!client) throw new Error("Missing query client");
	mocks.signOut.mockImplementation(async () => {
		expect(authIdentity(client).snapshot().status).toBe("checking");
		expect(client.getQueryData(["private"])).toBeUndefined();
		return { error: null };
	});
	const { result } = renderHook(useSignOut);
	await act(async () => result.current());
	expect(authIdentity(client).snapshot()).toMatchObject({ status: "confirmed", session: null });
	expect(client.getQueryData(sessionQueryKey)).toBeNull();
	expect(mocks.router.navigate).toHaveBeenCalledWith({ to: "/auth/login", search: { locale: "en-US" }, replace: true });
});
it("reconciles the real session after a failed sign-out without navigating", async () => {
	mocks.signOut.mockResolvedValue({ error: { message: "Network unavailable" } });
	const { result } = renderHook(useSignOut);
	await act(async () => {
		await expect(result.current()).rejects.toMatchObject({ message: "Network unavailable" });
	});
	expect(mocks.router.navigate).not.toHaveBeenCalled();
	expect(mocks.router.invalidate).toHaveBeenCalled();
});
it("recovers the confirmed identity and original error when router invalidation also fails", async () => {
	const failure = new Error("Sign-out unavailable");
	mocks.signOut.mockRejectedValue(failure);
	mocks.router.invalidate.mockRejectedValue(new Error("Loader unavailable"));
	const { result } = renderHook(useSignOut);
	await act(async () => {
		await expect(result.current()).rejects.toBe(failure);
	});
	if (!mocks.client) throw new Error("Missing query client");
	expect(authIdentity(mocks.client).snapshot()).toMatchObject({
		status: "confirmed",
		session: { user: { id: "owner" } },
	});
	expect(mocks.router.navigate).not.toHaveBeenCalled();
});
it("opens sign-in safely when failed sign-out cannot confirm the remaining session", async () => {
	const failure = new Error("Sign-out unavailable");
	mocks.signOut.mockRejectedValue(failure);
	mocks.getSession.mockRejectedValue(new Error("Session unavailable"));
	mocks.router.invalidate.mockRejectedValue(new Error("Loader unavailable"));
	const { result } = renderHook(useSignOut);
	await act(async () => {
		await expect(result.current()).rejects.toBe(failure);
	});
	if (!mocks.client) throw new Error("Missing query client");
	expect(authIdentity(mocks.client).snapshot()).toMatchObject({ status: "confirmed", session: null });
	expect(mocks.router.navigate).toHaveBeenCalledWith({ to: "/auth/login", search: { locale: "en-US" }, replace: true });
});
