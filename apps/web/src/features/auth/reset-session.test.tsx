// @vitest-environment happy-dom

import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({ resetPassword: vi.fn(), navigate: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/libs/auth/client", () => ({ authClient: { resetPassword: mocks.resetPassword } }));
vi.mock("@/libs/root-context", () => ({ sessionQueryKey: ["auth", "session"] }));
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mocks.navigate,
	useRouter: () => ({ invalidate: mocks.invalidate }),
	Link: ({ to, ...props }: ComponentProps<"a"> & { to: string }) => (
		// oxlint-disable-next-line jsx-a11y/anchor-has-content -- Children are forwarded through props.
		<a href={to} {...props} />
	),
}));

import { ResetPasswordPage } from "./pages/reset-password";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const sessionKey = ["auth", "session"] as const;
beforeEach(() => {
	vi.resetAllMocks();
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	queryClient.setQueryData(sessionKey, { user: { id: "synthetic-owner", emailVerified: true } });
	queryClient.setQueryData(["career", "profile"], { name: "Synthetic Account" });
	mocks.resetPassword.mockResolvedValue({ error: null });
});
afterEach(() => {
	cleanup();
	queryClient.clear();
});

function submitReset() {
	const { container } = render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={queryClient}>
				<ResetPasswordPage token="synthetic-reset" />
			</QueryClientProvider>
		</I18nProvider>,
	);
	for (const name of ["password", "confirmation"]) {
		const input = container.querySelector(`input[name="${name}"]`);
		if (!input) throw new Error("Missing password input");
		fireEvent.change(input, { target: { value: "Replacement-pass-123" } });
	}
	const form = container.querySelector("form");
	if (!form) throw new Error("Missing reset form");
	fireEvent.submit(form);
}

describe("password reset session recovery", () => {
	it("removes private data and refreshes revoked session before navigating to sign-in", async () => {
		let finishRefresh: (() => void) | undefined;
		mocks.invalidate.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					finishRefresh = () => {
						queryClient.setQueryData(sessionKey, null);
						resolve();
					};
				}),
		);
		submitReset();
		await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledOnce());
		expect(queryClient.getQueryData(["career", "profile"])).toBeUndefined();
		expect(queryClient.getQueryData(sessionKey)).toBeUndefined();
		expect(mocks.navigate).not.toHaveBeenCalled();
		finishRefresh?.();
		await waitFor(() =>
			expect(mocks.navigate).toHaveBeenCalledWith({
				to: "/auth/login",
				search: { reason: "passwordChanged" },
				replace: true,
			}),
		);
		expect(queryClient.getQueryData(sessionKey)).toBeNull();
	});

	it("retains the session and private data after a rejected reset", async () => {
		mocks.resetPassword.mockResolvedValue({ error: { code: "INVALID_TOKEN" } });
		submitReset();
		await screen.findByRole("alert");
		expect(queryClient.getQueryData(["career", "profile"])).toEqual({ name: "Synthetic Account" });
		expect(queryClient.getQueryData(sessionKey)).toBeDefined();
		expect(mocks.invalidate).not.toHaveBeenCalled();
		expect(mocks.navigate).not.toHaveBeenCalled();
	});
});
