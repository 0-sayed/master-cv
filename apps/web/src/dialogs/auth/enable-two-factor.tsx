import type { DialogProps } from "../store";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useSelector } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { match } from "ts-pattern";
import z from "zod";
import { ActionGroup } from "@reactive-resume/ui/components/action-group";
import { Button } from "@reactive-resume/ui/components/button";
import {
	DialogContent,
	DialogSteps,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@reactive-resume/ui/components/dialog";
import { FormControl, FormItem, FormLabel, FormMessage } from "@reactive-resume/ui/components/form";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Input } from "@reactive-resume/ui/components/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@reactive-resume/ui/components/input-group";
import { Label } from "@reactive-resume/ui/components/label";
import { OTPField } from "@reactive-resume/ui/components/otp-field";
import { toast } from "@reactive-resume/ui/components/toast";
import { downloadWithAnchor } from "@reactive-resume/utils/file";
import { useDialogStore } from "../store";
import { PasswordInput } from "@/components/input/password-input";
import { AccountFormError } from "@/features/auth/components/account-form-error";
import { accountSecurityQueryOptions } from "@/features/settings/account/auth-hooks";
import { useFormBlocker } from "@/hooks/use-form-blocker";
import { authClient } from "@/libs/auth/client";
import { sessionQueryKey } from "@/libs/root-context";
import { useAppForm } from "@/libs/tanstack-form";

const enableFormSchema = z.object({
	password: z.string().min(6).max(64),
});

type TwoFactorSetupStep = "backup" | "enable" | "verify";

type TwoFactorStepProps = {
	step: TwoFactorSetupStep;
};

type TwoFactorQRCodeProps = {
	totpUri: string;
};

export function EnableTwoFactorDialog(_: DialogProps<"auth.two-factor.enable">) {
	useLingui();
	const verifyFormSchema = z.object({ code: z.string().regex(/^[0-9]{6}$/, t`Code must be 6 digits`) });
	const router = useRouter();
	const queryClient = useQueryClient();

	const [totpUri, setTotpUri] = useState<string | null>(null);
	const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
	const [step, setStep] = useState<TwoFactorSetupStep>("enable");

	const closeDialog = useDialogStore((state) => state.closeDialog);
	const [failure, setFailure] = useState<unknown>(null);
	const [copied, setCopied] = useState(false);

	const enableForm = useAppForm({
		defaultValues: { password: "" },
		validators: { onSubmit: enableFormSchema },
		onSubmit: async ({ value }) => {
			setFailure(null);
			try {
				const { data, error } = await authClient.twoFactor.enable({ password: value.password, issuer: "Sirawise" });
				if (error) {
					setFailure(error);
					return;
				}
				if (data.method !== "totp") {
					setFailure({ code: "MFA_SETUP_UNAVAILABLE" });
					return;
				}
				setTotpUri(data.totpURI);
				setBackupCodes(data.backupCodes);
				setStep("verify");
			} catch (error) {
				setFailure(error);
			}
		},
	});

	const verifyForm = useAppForm({
		defaultValues: { code: "" },
		validators: { onSubmit: verifyFormSchema },
		onSubmit: async ({ value }) => {
			setFailure(null);
			try {
				const { error } = await authClient.twoFactor.verifyTotp({ code: value.code });
				if (error) {
					setFailure(error);
					return;
				}
			} catch (error) {
				setFailure(error);
				return;
			}
			toast.add({ type: "success", description: t`Two-factor authentication is now enabled.` });
			void queryClient.invalidateQueries({ queryKey: accountSecurityQueryOptions().queryKey });
			void queryClient.invalidateQueries({ queryKey: sessionQueryKey }).then(() => router.invalidate());
			setStep("backup");
		},
	});

	const enableIsDirty = useSelector(enableForm.store, (s) => s.isDirty);
	const enableIsSubmitting = useSelector(enableForm.store, (s) => s.isSubmitting);
	const verifyIsDirty = useSelector(verifyForm.store, (s) => s.isDirty);
	const verifyIsSubmitting = useSelector(verifyForm.store, (s) => s.isSubmitting);

	const { requestClose } = useFormBlocker(enableForm, {
		shouldBlock: () => {
			if (step === "enable") return enableIsDirty && !enableIsSubmitting;
			if (step === "verify") return verifyIsDirty && !verifyIsSubmitting;
			return false;
		},
	});

	const onConfirmBackup = () => {
		closeDialog();
		onReset();
	};

	const onReset = () => {
		enableForm.reset();
		verifyForm.reset();
		setStep("enable");
		setTotpUri(null);
		setBackupCodes(null);
	};

	const handleCopySecret = async () => {
		if (!totpUri) return;
		const secret = extractSecretFromTotpUri(totpUri);
		if (!secret) return;
		await navigator.clipboard.writeText(secret);
		setCopied(true);
	};

	const handleCopyBackupCodes = async () => {
		if (!backupCodes) return;
		await navigator.clipboard.writeText(backupCodes.join("\n"));
		toast.add({ type: "success", description: t`Backup codes copied to clipboard.` });
	};

	const handleDownloadBackupCodes = () => {
		if (!backupCodes) return;
		downloadWithAnchor(new Blob([backupCodes.join("\n")], { type: "text/plain" }), "sirawise_backup-codes.txt");
	};

	return (
		<DialogContent>
			<DialogHeader>
				<DialogTitle>
					<TwoFactorDialogTitle step={step} />
				</DialogTitle>
				<DialogDescription>
					<TwoFactorDialogDescription step={step} />
				</DialogDescription>
			</DialogHeader>

			<AccountFormError
				error={failure}
				pending={enableIsSubmitting || verifyIsSubmitting}
				onRetry={() => void (step === "enable" ? enableForm : verifyForm).handleSubmit()}
			/>

			{match(step)
				.with("enable", () => (
					<form
						className="space-y-4"
						onSubmit={(event) => {
							event.preventDefault();
							event.stopPropagation();
							void enableForm.handleSubmit();
						}}
					>
						<enableForm.Field name="password">
							{(field) => (
								<FormItem hasError={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
									<FormLabel>
										<Trans>Password</Trans>
									</FormLabel>
									<FormControl
										render={
											<PasswordInput
												minLength={6}
												maxLength={64}
												autoComplete="current-password"
												name={field.name}
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(event) => field.handleChange(event.target.value)}
											/>
										}
									/>
									<FormMessage errors={field.state.meta.errors} />
								</FormItem>
							)}
						</enableForm.Field>

						<DialogFooter>
							<Button type="button" variant="secondary" disabled={enableIsSubmitting} onClick={requestClose}>
								<Trans context="workspace.privacy.19766ed6ccb2">Cancel</Trans>
							</Button>
							<Button type="submit" disabled={enableIsSubmitting}>
								<Trans>Continue</Trans>
							</Button>
						</DialogFooter>
					</form>
				))
				.with("verify", () => {
					const secret = totpUri ? extractSecretFromTotpUri(totpUri) : null;
					return (
						<div className="space-y-4">
							<form
								className="space-y-4"
								onSubmit={(event) => {
									event.preventDefault();
									event.stopPropagation();
									void verifyForm.handleSubmit();
								}}
							>
								<DialogSteps>
									<li>
										<p className="type-label">
											<Trans>Scan the QR with your authenticator app</Trans>
										</p>
										{totpUri && (
											<div className="flex justify-center">
												<TwoFactorQRCode totpUri={totpUri} />
											</div>
										)}
									</li>
									<li>
										<FormItem>
											<Label htmlFor="totp-secret">
												<Trans>Can't scan? Use the manual setup key</Trans>
											</Label>
											<InputGroup dir="ltr">
												<InputGroupInput
													id="totp-secret"
													aria-label={t`Manual setup key`}
													readOnly
													dir="ltr"
													value={secret?.match(/.{1,4}/g)?.join(" ") ?? ""}
												/>
												<InputGroupAddon align="inline-end">
													<InputGroupButton size="icon-lg" aria-label={t`Copy secret`} onClick={handleCopySecret}>
														<Icon name="copy" />
													</InputGroupButton>
												</InputGroupAddon>
											</InputGroup>
										</FormItem>
										<p role="status" className="type-caption text-ink-2">
											{copied ? t`Secret copied to clipboard.` : ""}
										</p>
									</li>
									<li>
										<p className="type-label">
											<Trans>Enter the 6-digit code</Trans>
										</p>
										<verifyForm.Field name="code">
											{(field) => (
												<FormItem hasError={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
													<FormLabel className="sr-only">
														<Trans>6-digit code</Trans>
													</FormLabel>
													<FormControl
														render={
															<OTPField
																length={6}
																aria-label={t`6-digit code`}
																name={field.name}
																value={field.state.value}
																onBlur={field.handleBlur}
																onValueChange={field.handleChange}
															/>
														}
													/>
													<FormMessage errors={field.state.meta.errors} />
												</FormItem>
											)}
										</verifyForm.Field>
									</li>
								</DialogSteps>

								<DialogFooter>
									<Button type="button" variant="secondary" onClick={requestClose}>
										<Trans comment="Secondary action button to close two-factor setup dialog">Cancel</Trans>
									</Button>
									<Button type="submit" disabled={verifyIsSubmitting}>
										<Trans>Verify</Trans>
									</Button>
								</DialogFooter>
							</form>
						</div>
					);
				})
				.with("backup", () => (
					<div className="space-y-4">
						{backupCodes && (
							<div className="space-y-4">
								<div className="grid grid-cols-2 gap-2">
									{backupCodes.map((code, index) => (
										<Input key={code} readOnly dir="ltr" aria-label={`${t`Backup code`} ${index + 1}`} value={code} />
									))}
								</div>

								<ActionGroup responsive="stack">
									<Button type="button" variant="secondary" onClick={handleDownloadBackupCodes}>
										<Icon name="arrow-down" />
										<Trans comment="Action button to download two-factor backup codes as a text file">Download</Trans>
									</Button>
									<Button type="button" variant="ghost" onClick={handleCopyBackupCodes}>
										<Icon name="copy" />
										<Trans comment="Action button to copy two-factor backup codes to clipboard">Copy</Trans>
									</Button>
								</ActionGroup>
							</div>
						)}

						<DialogFooter>
							<Button type="button" variant="secondary" onClick={requestClose}>
								<Trans context="workspace.privacy.19766ed6ccb2">Cancel</Trans>
							</Button>
							<Button type="button" onClick={onConfirmBackup}>
								<Trans comment="Final action button after saving backup codes">Continue</Trans>
							</Button>
						</DialogFooter>
					</div>
				))
				.exhaustive()}
		</DialogContent>
	);
}

function extractSecretFromTotpUri(totpUri: string): string | null {
	try {
		const url = new URL(totpUri);
		return url.searchParams.get("secret");
	} catch {
		return null;
	}
}

function TwoFactorDialogTitle({ step }: TwoFactorStepProps) {
	return match(step)
		.with("enable", () => <Trans>Enable Two-Factor Authentication</Trans>)
		.with("verify", () => <Trans>Setup Authenticator App</Trans>)
		.with("backup", () => <Trans>Copy Backup Codes</Trans>)
		.exhaustive();
}

function TwoFactorDialogDescription({ step }: TwoFactorStepProps) {
	return match(step)
		.with("enable", () => (
			<Trans>
				Enter your password to confirm setting up two-factor authentication. Once it is on, you need a code from your
				authenticator app every time you sign in.
			</Trans>
		))
		.with("verify", () => <Trans>Add Sirawise to your authenticator app, then verify the code.</Trans>)
		.with("backup", () => <Trans>Copy and store these backup codes in case you lose your device.</Trans>)
		.exhaustive();
}

function TwoFactorQRCode({ totpUri }: TwoFactorQRCodeProps) {
	return (
		<QRCodeSVG
			value={totpUri}
			size={256}
			marginSize={4}
			className="shrink-0"
			role="img"
			aria-label={t`QR code for adding Sirawise to your authenticator app`}
		/>
	);
}
