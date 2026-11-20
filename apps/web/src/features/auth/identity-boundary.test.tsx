// @vitest-environment happy-dom
import type { AuthSession } from "@reactive-resume/auth/types";
import { act, cleanup, render } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";
import { QueryClient } from "@tanstack/react-query";
import { IdentityBoundary } from "./identity-boundary";
import { authIdentity, sessionQueryKey } from "@/libs/auth/identity";

const mocks = vi.hoisted(() => ({
	pending: false,
	session: null as AuthSession | null,
	refetch: vi.fn().mockResolvedValue(undefined),
	router: { invalidate: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => mocks.router }));
vi.mock("better-auth/client", () => ({ getGlobalBroadcastChannel: () => ({ subscribe: () => () => {} }) }));
vi.mock("@/features/documents/webmcp", () => ({ useDocumentWebMcpTools: () => {} }));
vi.mock("@/libs/auth/client", () => ({
	authClient: {
		useSession: () => ({ data: mocks.session, isPending: mocks.pending, error: null, refetch: mocks.refetch }),
	},
}));
it("does not hide signed-out routing or start another check while session identity is unconfirmed", () => {
	const queryClient = new QueryClient();
	const identity = authIdentity(queryClient);
	identity.markUnconfirmed();
	mocks.session = { user: { id: "still-reported-signed-in" } } as AuthSession;
	const view = render(
		<IdentityBoundary queryClient={queryClient} session={null}>
			Signed-out route
		</IdentityBoundary>,
	);
	expect(view.getByText("Signed-out route")).toBeVisible();
	expect(mocks.refetch).not.toHaveBeenCalled();
	expect(mocks.router.invalidate).not.toHaveBeenCalled();
	mocks.session = null;
	cleanup();
});

it("does not cancel an in-flight identity reconciliation when reactive session pending toggles or the router has not committed", async () => {
	const session = { user: { id: "previous-owner" } } as AuthSession;
	const queryClient = new QueryClient();
	queryClient.setQueryData(sessionQueryKey, session);
	const identity = authIdentity(queryClient);
	const element = () => (
		<IdentityBoundary queryClient={queryClient} session={session}>
			Private content
		</IdentityBoundary>
	);
	const view = render(element());
	for (let index = 0; index < 3; index++) {
		mocks.pending = true;
		await act(async () => view.rerender(element()));
		mocks.pending = false;
		await act(async () => view.rerender(element()));
	}
	expect(view.queryByText("Private content")).toBeNull();
	expect(mocks.refetch).toHaveBeenCalledTimes(1);
	expect(mocks.router.invalidate).toHaveBeenCalledTimes(1);
	// Root beforeLoad confirms sign-out before the router commits its new context.
	await act(async () => {
		identity.accept(null);
	});
	expect(identity.snapshot().status).toBe("confirmed");
	expect(mocks.refetch).toHaveBeenCalledTimes(1);
	expect(view.queryByText("Private content")).toBeNull();
	cleanup();
});
