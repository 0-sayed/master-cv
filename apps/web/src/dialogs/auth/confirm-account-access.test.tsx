// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { ConfirmAccountAccess } from "./confirm-account-access";
const calls = vi.hoisted(() => ({ begin: vi.fn(), verify: vi.fn() }));
vi.mock("@/libs/orpc/client", () => ({ client: { privacy: { beginProof: calls.begin, verifyProof: calls.verify } } }));
vi.mock("@reactive-resume/ui/components/task-overlay", () => {
	const Box = ({ children }: { children: ReactNode }) => <div>{children}</div>;
	return {
		TaskOverlay: Box,
		TaskOverlayContent: Box,
		TaskOverlayHeader: Box,
		TaskOverlayTitle: Box,
		TaskOverlayDescription: Box,
		TaskOverlayFooter: Box,
	};
});
afterEach(() => {
	cleanup();
	vi.resetAllMocks();
	vi.unstubAllGlobals();
});
function show() {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	const verified = vi.fn();
	render(
		<I18nProvider i18n={i18n}>
			<ConfirmAccountAccess action="delete_account" requestNonce="review" onVerified={verified} onCancel={vi.fn()} />
		</I18nProvider>,
	);
	return verified;
}
it("proof success reports proof without submitting the destructive action", async () => {
	calls.begin.mockResolvedValue({
		challengeId: "challenge",
		methods: ["password"],
		expiresAt: new Date(Date.now() + 300000).toISOString(),
	});
	const proof = {
		token: "synthetic",
		action: "delete_account",
		expiresAt: new Date(Date.now() + 300000).toISOString(),
	};
	calls.verify.mockResolvedValue(proof);
	const verified = show();
	fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "synthetic-password" } });
	fireEvent.click(screen.getByRole("button", { name: "Confirm access" }));
	await waitFor(() => expect(verified).toHaveBeenCalledExactlyOnceWith(proof));
	expect(calls.begin).toHaveBeenCalledExactlyOnceWith({ action: "delete_account", requestNonce: "review" });
});
it("unsupported passkey retains a visible recovery action and never returns proof", async () => {
	calls.begin.mockResolvedValue({
		challengeId: "challenge",
		methods: ["passkey"],
		passkeyOptions: { challenge: "c3ludGhldGlj" },
		expiresAt: new Date(Date.now() + 300000).toISOString(),
	});
	const verified = show();
	fireEvent.click(await screen.findByRole("button", { name: "Use passkey" }));
	await screen.findByRole("alert");
	expect(verified).not.toHaveBeenCalled();
	expect(calls.verify).not.toHaveBeenCalled();
	expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
});

it.each(["NotAllowedError", "AbortError"])("passkey %s never returns proof and permits retry", async (name) => {
	calls.begin.mockResolvedValue({
		challengeId: "challenge",
		methods: ["passkey"],
		passkeyOptions: { challenge: "c3ludGhldGlj" },
		expiresAt: new Date(Date.now() + 300000).toISOString(),
	});
	const get = vi.fn().mockRejectedValue(new DOMException("Cancelled", name));
	vi.stubGlobal("PublicKeyCredential", class {});
	vi.stubGlobal("navigator", { credentials: { get } });
	const verified = show();
	fireEvent.click(await screen.findByRole("button", { name: "Use passkey" }));
	await screen.findByRole("alert");
	expect(verified).not.toHaveBeenCalled();
	expect(calls.verify).not.toHaveBeenCalled();
	expect(get).toHaveBeenCalledWith(
		expect.objectContaining({ publicKey: expect.objectContaining({ userVerification: "required" }) }),
	);
});
it("UV verification rejection remains unconfirmed", async () => {
	class Credential {
		toJSON() {
			return {
				id: "synthetic",
				rawId: "synthetic",
				type: "public-key",
				clientExtensionResults: {},
				response: { authenticatorData: "synthetic", clientDataJSON: "synthetic", signature: "synthetic" },
			};
		}
	}
	calls.begin.mockResolvedValue({
		challengeId: "challenge",
		methods: ["passkey"],
		passkeyOptions: { challenge: "c3ludGhldGlj" },
		expiresAt: new Date(Date.now() + 300000).toISOString(),
	});
	vi.stubGlobal("PublicKeyCredential", Credential);
	vi.stubGlobal("navigator", { credentials: { get: vi.fn().mockResolvedValue(new Credential()) } });
	calls.verify.mockRejectedValue(new Error("USER_VERIFICATION_REQUIRED"));
	const verified = show();
	fireEvent.click(await screen.findByRole("button", { name: "Use passkey" }));
	await screen.findByRole("alert");
	expect(calls.verify).toHaveBeenCalledOnce();
	expect(verified).not.toHaveBeenCalled();
});
it("MFA and network failures retain input and retry starts a fresh challenge", async () => {
	calls.begin.mockResolvedValue({
		challengeId: "challenge",
		methods: ["password"],
		expiresAt: new Date(Date.now() + 300000).toISOString(),
	});
	calls.verify.mockRejectedValue(new Error("MFA_REQUIRED"));
	const verified = show();
	fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "synthetic-password" } });
	fireEvent.change(screen.getByLabelText("Authenticator code, if enabled"), { target: { value: "123456" } });
	fireEvent.click(screen.getByRole("button", { name: "Confirm access" }));
	await screen.findByRole("alert");
	expect(screen.getByLabelText("Password")).toHaveValue("synthetic-password");
	expect(calls.verify).toHaveBeenCalledWith({
		challengeId: "challenge",
		credential: { method: "password", password: "synthetic-password", mfaCode: "123456" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Try again" }));
	await waitFor(() => expect(calls.begin).toHaveBeenCalledTimes(2));
	expect(verified).not.toHaveBeenCalled();
});
