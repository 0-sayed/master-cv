import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { FormItem } from "@reactive-resume/ui/components/form";
import { Input } from "@reactive-resume/ui/components/input";
import { Label } from "@reactive-resume/ui/components/label";
import { OTPField } from "@reactive-resume/ui/components/otp-field";
import {
	TaskOverlayContent,
	TaskOverlayHeader,
	TaskOverlayTitle,
	TaskOverlayDescription,
	TaskOverlayFooter,
} from "@reactive-resume/ui/components/task-overlay";
import { useDialogStore } from "../store";
import { ConfirmAccountAccess } from "./confirm-account-access";
import { PasswordInput } from "@/components/input/password-input";
import { useAccountSecurity } from "@/features/settings/account/auth-hooks";
import { PrivacyNotice } from "@/features/settings/privacy/notice";
import { client } from "@/libs/orpc/client";
export function ChangeEmailDialog() {
	const security = useAccountSecurity();
	const [confirming, setConfirming] = useState(false);
	const close = useDialogStore((s) => s.closeDialog);
	const query = useQueryClient();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [code, setCode] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState(false);
	const [nonce] = useState(() => crypto.randomUUID());
	if (confirming)
		return (
			<ConfirmAccountAccess
				action="change_email"
				requestNonce={nonce}
				onCancel={() => setConfirming(false)}
				onVerified={(proof) => {
					setPending(true);
					void client.privacy
						.requestEmailChange({
							newEmail: email,
							requestNonce: nonce,
							credential: { method: "proof", token: proof.token },
						})
						.then(async () => {
							await query.invalidateQueries();
							close();
						})
						.catch(() => {
							setConfirming(false);
							setError(true);
						})
						.finally(() => setPending(false));
				}}
			/>
		);
	return (
		<TaskOverlayContent closeLabel={t`Close`}>
			<TaskOverlayHeader>
				<TaskOverlayTitle>
					<Trans context="account.email.change">Change email address</Trans>
				</TaskOverlayTitle>
				<TaskOverlayDescription>
					<Trans context="workspace.privacy.b31fdcdd30ee">
						Your current email stays active. Confirm the request at your old address, then verify the new address.
					</Trans>
				</TaskOverlayDescription>
			</TaskOverlayHeader>
			{error && (
				<PrivacyNotice
					error
					title={<Trans context="workspace.privacy.638128918947">Could not request the email change</Trans>}
				>
					<Trans context="workspace.privacy.4946032d08f7">
						Check your address, password and authenticator code, then try again. Your existing email is unchanged.
					</Trans>
				</PrivacyNotice>
			)}
			<form
				className="grid gap-4"
				onSubmit={async (e) => {
					e.preventDefault();
					if (pending) return;
					if (security.status !== "ready") return;
					if (!security.data.credentials.hasPassword) {
						setConfirming(true);
						return;
					}
					setPending(true);
					setError(false);
					try {
						await client.privacy.requestEmailChange({
							newEmail: email,
							requestNonce: nonce,
							credential: { method: "password", password, ...(code ? { mfaCode: code } : {}) },
						});
						await query.invalidateQueries();
						close();
					} catch {
						setError(true);
					} finally {
						setPending(false);
					}
				}}
			>
				<FormItem>
					<Label htmlFor="new-email">
						<Trans context="account.email.newAddressLabel">New email</Trans>
					</Label>
					<Input
						id="new-email"
						type="email"
						dir="ltr"
						autoComplete="email"
						maxLength={254}
						required
						value={email}
						onChange={(e) => setEmail(e.target.value)}
					/>
				</FormItem>
				{security.status === "ready" && security.data.credentials.hasPassword && (
					<>
						<FormItem>
							<Label htmlFor="email-password">
								<Trans context="workspace.privacy.72ed2bd767ce">Current password</Trans>
							</Label>
							<PasswordInput
								id="email-password"
								autoComplete="current-password"
								required
								value={password}
								onChange={(e) => setPassword(e.target.value)}
							/>
						</FormItem>
						<FormItem>
							<Label htmlFor="email-code">
								<Trans context="workspace.privacy.48c3fd47aeb1">Authenticator code, if enabled</Trans>
							</Label>
							<OTPField id="email-code" length={6} aria-label={t`6-digit code`} value={code} onValueChange={setCode} />
						</FormItem>
					</>
				)}
				{security.status !== "ready" && (
					<PrivacyNotice
						error
						title={<Trans>Account methods are unavailable</Trans>}
						action={
							<Button variant="secondary" onClick={() => void security.refresh()}>
								<Trans>Try again</Trans>
							</Button>
						}
					/>
				)}
				<TaskOverlayFooter>
					<Button variant="secondary" disabled={pending} onClick={close}>
						<Trans context="workspace.privacy.19766ed6ccb2">Cancel</Trans>
					</Button>
					<Button type="submit" loading={pending} disabled={security.status !== "ready"}>
						<Trans context="account.email.sendVerification">Send verification link</Trans>
					</Button>
				</TaskOverlayFooter>
			</form>
		</TaskOverlayContent>
	);
}
