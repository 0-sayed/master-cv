import type { RouterOutput } from "@/libs/orpc/client";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { FormItem } from "@reactive-resume/ui/components/form";
import { Label } from "@reactive-resume/ui/components/label";
import { OTPField } from "@reactive-resume/ui/components/otp-field";
import {
	TaskOverlay,
	TaskOverlayContent,
	TaskOverlayHeader,
	TaskOverlayTitle,
	TaskOverlayDescription,
	TaskOverlayFooter,
} from "@reactive-resume/ui/components/task-overlay";
import { PasswordInput } from "@/components/input/password-input";
import { PrivacyNotice } from "@/features/settings/privacy/notice";
import { client } from "@/libs/orpc/client";
export type AccountProof = RouterOutput["privacy"]["verifyProof"];
export type AccountProofAction = "export_account" | "delete_account" | "change_email";
export function ConfirmAccountAccess({
	action,
	requestNonce,
	onVerified,
	onCancel,
}: {
	action: AccountProofAction;
	requestNonce: string;
	onVerified: (proof: AccountProof) => void;
	onCancel: () => void;
}) {
	const [challenge, setChallenge] = useState<RouterOutput["privacy"]["beginProof"]>();
	const [password, setPassword] = useState("");
	const [code, setCode] = useState("");
	const [failed, setFailed] = useState(false);
	const [pending, setPending] = useState(false);
	const [retry, setRetry] = useState(0);
	useEffect(() => {
		let live = true;
		void client.privacy
			.beginProof({ action, requestNonce })
			.then((value) => {
				if (live) {
					setChallenge(value);
					setFailed(false);
				}
			})
			.catch(() => {
				if (live) setFailed(true);
			});
		return () => {
			live = false;
		};
	}, [action, requestNonce, retry]);
	const verify = async (method: "password" | "passkey") => {
		if (!challenge || pending) return;
		setPending(true);
		setFailed(false);
		try {
			let credential: Parameters<typeof client.privacy.verifyProof>[0]["credential"];
			if (method === "password") credential = { method, password, ...(code ? { mfaCode: code } : {}) };
			else {
				if (!challenge.passkeyOptions || !globalThis.PublicKeyCredential || !navigator.credentials)
					throw new Error("PASSKEY_UNSUPPORTED");
				const options = challenge.passkeyOptions;
				const decode = (s: string) =>
					Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));
				const key = await navigator.credentials.get({
					publicKey: {
						challenge: decode(options.challenge),
						userVerification: "required",
						...(options.rpId ? { rpId: options.rpId } : {}),
						...(options.timeout ? { timeout: options.timeout } : {}),
					},
				});
				if (!(key instanceof PublicKeyCredential)) throw new Error("PASSKEY_CANCELLED");
				const response = key.toJSON();
				credential = {
					method,
					response: response as Extract<
						Parameters<typeof client.privacy.verifyProof>[0]["credential"],
						{ method: "passkey" }
					>["response"],
				};
			}
			const proof = await client.privacy.verifyProof({ challengeId: challenge.challengeId, credential });
			setPassword("");
			setCode("");
			onVerified(proof);
		} catch {
			setFailed(true);
		} finally {
			setPending(false);
		}
	};
	return (
		<TaskOverlay
			open
			onOpenChange={(open) => {
				if (!open && !pending) onCancel();
			}}
		>
			<TaskOverlayContent closeLabel={t`Close`}>
				<TaskOverlayHeader>
					<TaskOverlayTitle>
						<Trans context="workspace.privacy.dd22ddce5063">Confirm account access</Trans>
					</TaskOverlayTitle>
					<TaskOverlayDescription>
						{action === "change_email" ? (
							<Trans>Confirm access to change your email address.</Trans>
						) : action === "export_account" ? (
							<Trans context="workspace.privacy.317adfe36b29">
								Confirm access to request a private copy of your data.
							</Trans>
						) : (
							<Trans context="workspace.privacy.3dcbe0eaf08d">
								Confirm access to continue reviewing deletion. This does not submit deletion.
							</Trans>
						)}
					</TaskOverlayDescription>
				</TaskOverlayHeader>
				{failed && (
					<PrivacyNotice
						error
						title={<Trans context="workspace.privacy.6d52b5a144a2">Could not confirm access</Trans>}
						action={
							<Button
								variant="secondary"
								onClick={() => {
									setChallenge(undefined);
									setFailed(false);
									setRetry((n) => n + 1);
								}}
							>
								<Trans context="workspace.privacy.d8b8392e2c54">Try again</Trans>
							</Button>
						}
					>
						<Trans context="workspace.privacy.f0e4c5d4158b">
							Check your password and authenticator code, or retry your passkey. Expired confirmation requires a new
							check.
						</Trans>
					</PrivacyNotice>
				)}
				{!challenge && !failed && (
					<p role="status">
						<Trans context="workspace.privacy.36856042b25a">Preparing secure confirmation…</Trans>
					</p>
				)}
				<form
					onSubmit={(event) => {
						event.preventDefault();
						void verify("password");
					}}
					className="grid gap-4"
				>
					{challenge?.methods.includes("password") && (
						<>
							<FormItem>
								<Label htmlFor="access-password">
									<Trans context="workspace.privacy.e7cf3ef4f17c">Password</Trans>
								</Label>
								<PasswordInput
									id="access-password"
									autoComplete="current-password"
									required
									value={password}
									onChange={(e) => setPassword(e.target.value)}
								/>
							</FormItem>
							<FormItem>
								<Label htmlFor="access-code">
									<Trans context="workspace.privacy.48c3fd47aeb1">Authenticator code, if enabled</Trans>
								</Label>
								<OTPField
									id="access-code"
									length={6}
									aria-label={t`6-digit code`}
									value={code}
									onValueChange={setCode}
								/>
							</FormItem>
						</>
					)}
					{challenge?.methods.includes("passkey") && (
						<Button variant="secondary" loading={pending} onClick={() => void verify("passkey")}>
							<Trans context="workspace.privacy.87f08d30fbad">Use passkey</Trans>
						</Button>
					)}
					<TaskOverlayFooter>
						<Button variant="secondary" disabled={pending} onClick={onCancel}>
							<Trans context="workspace.privacy.19766ed6ccb2">Cancel</Trans>
						</Button>
						{challenge?.methods.includes("password") && (
							<Button type="submit" loading={pending}>
								<Trans context="workspace.privacy.a0316314c96d">Confirm access</Trans>
							</Button>
						)}
					</TaskOverlayFooter>
				</form>
			</TaskOverlayContent>
		</TaskOverlay>
	);
}
