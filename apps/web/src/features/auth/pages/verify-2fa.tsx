import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useSelector } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import z from "zod";
import { BackNavigation } from "@reactive-resume/ui/components/back-navigation";
import { Button } from "@reactive-resume/ui/components/button";
import { Checkbox } from "@reactive-resume/ui/components/checkbox";
import { DialogFooter } from "@reactive-resume/ui/components/dialog";
import { FormControl, FormItem, FormLabel, FormMessage } from "@reactive-resume/ui/components/form";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Input } from "@reactive-resume/ui/components/input";
import { OTPField } from "@reactive-resume/ui/components/otp-field";
import { toast } from "@reactive-resume/ui/components/toast";
import { AuthErrorSummary } from "../components/auth-error-summary";
import { AuthHeading } from "../components/auth-heading";
import { authErrorMessage } from "../errors";
import { getAuthRedirectOptions, getOAuthCreationOptions, getOAuthSignInOptions, isOAuthRedirect } from "../redirect";
import { authClient } from "@/libs/auth/client";
import { sessionQueryKey } from "@/libs/root-context";
import { useAppForm } from "@/libs/tanstack-form";

const backupCodeSchema = z.object({
	code: z.string().trim(),
	trustDevice: z.boolean(),
});

type TwoFactorVerificationPageProps = {
	backupCode?: boolean;
};

function TwoFactorVerificationPage({ backupCode = false }: TwoFactorVerificationPageProps) {
	useLingui();
	const totpSchema = z.object({
		code: z.string().regex(/^\d{6}$/, t`Code must be 6 digits`),
		trustDevice: z.boolean(),
	});
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const router = useRouter();
	const queryClient = useQueryClient();
	const { callbackURL, reauthenticate } = useSearch({ from: "/auth" });
	const navigate = useNavigate();

	const form = useAppForm({
		defaultValues: { code: "", trustDevice: false },
		validators: { onSubmit: backupCode ? backupCodeSchema : totpSchema },
		onSubmit: async ({ value }) => {
			setErrorMessage(null);
			const toastId = toast.add({
				type: "loading",
				description: backupCode ? t`Verifying backup code...` : t`Verifying code...`,
			});
			try {
				const rawCode = value.code.trim().replaceAll("-", "");
				const code = backupCode ? `${rawCode.slice(0, 5)}-${rawCode.slice(5)}` : value.code;
				const creation = getOAuthCreationOptions(callbackURL);
				const options = {
					code,
					trustDevice: value.trustDevice,
					...(creation ? {} : getOAuthSignInOptions(callbackURL)),
				};
				const { data, error } = backupCode
					? await authClient.twoFactor.verifyBackupCode(options)
					: await authClient.twoFactor.verifyTotp(options);

				if (error) {
					toast.close(toastId);
					setErrorMessage(authErrorMessage(error.code));
					return;
				}

				toast.close(toastId);
				if (isOAuthRedirect(data)) return;
				if (creation) {
					const continuation = await authClient.oauth2.continue(creation);
					if (continuation.error) {
						setErrorMessage(authErrorMessage(continuation.error.code));
						return;
					}
					if (isOAuthRedirect(continuation.data)) return;
				}
				queryClient.clear();
				await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
				await router.invalidate();
				void navigate(getAuthRedirectOptions(callbackURL));
			} catch {
				toast.close(toastId);
				setErrorMessage(authErrorMessage(undefined));
			}
		},
	});

	const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);

	return (
		<>
			<AuthErrorSummary message={errorMessage} />
			<div className="space-y-1 text-center">
				<AuthHeading>
					{backupCode ? <Trans>Verify with a Backup Code</Trans> : <Trans>Two-Factor Authentication</Trans>}
				</AuthHeading>
				<div className="text-ink-3">
					{backupCode ? (
						<Trans>Enter one of your saved backup codes to access your account</Trans>
					) : (
						<Trans>Enter the verification code from your authenticator app</Trans>
					)}
				</div>
			</div>

			<form
				className="grid gap-6"
				onSubmit={(event) => {
					event.preventDefault();
					event.stopPropagation();
					void form.handleSubmit();
				}}
			>
				<form.Field name="code">
					{(field) => (
						<FormItem
							className="justify-self-center"
							hasError={field.state.meta.isTouched && field.state.meta.errors.length > 0}
						>
							<FormLabel className="sr-only">
								{backupCode ? <Trans>Backup code</Trans> : <Trans>Verification code</Trans>}
							</FormLabel>
							<FormControl
								render={
									backupCode ? (
										<Input
											type="text"
											maxLength={11}
											dir="ltr"
											name={field.name}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(event) => field.handleChange(event.target.value)}
										/>
									) : (
										<OTPField
											length={6}
											aria-label={t`6-digit code`}
											name={field.name}
											value={field.state.value}
											onBlur={field.handleBlur}
											onValueChange={field.handleChange}
										/>
									)
								}
							/>
							<FormMessage errors={field.state.meta.errors} />
						</FormItem>
					)}
				</form.Field>

				<form.Field name="trustDevice">
					{(field) => (
						<FormItem orientation="horizontal" className="justify-self-center">
							<FormControl
								render={<Checkbox name={field.name} checked={field.state.value} onCheckedChange={field.handleChange} />}
							/>
							<FormLabel>
								<Trans>Trust this device for 30 days</Trans>
							</FormLabel>
						</FormItem>
					)}
				</form.Field>

				<DialogFooter>
					<BackNavigation
						render={
							<Link to={backupCode ? "/auth/verify-2fa" : "/auth/login"} search={{ callbackURL, reauthenticate }} />
						}
					>
						{backupCode ? (
							<Trans comment="Secondary navigation button on backup-code verification screen">Go Back</Trans>
						) : (
							<Trans comment="Secondary navigation button on 2FA verification screen">Back to sign in</Trans>
						)}
					</BackNavigation>

					<Button type="submit" disabled={isSubmitting}>
						<Icon name="check" />
						{backupCode ? (
							<Trans comment="Primary action button to submit backup code">Verify</Trans>
						) : (
							<Trans comment="Primary action button to submit 2FA code">Verify</Trans>
						)}
					</Button>
				</DialogFooter>
			</form>

			{!backupCode && (
				<Button
					variant="link"
					size="link-touch"
					nativeButton={false}
					className="justify-self-center"
					render={
						<Link to="/auth/verify-2fa-backup" search={{ callbackURL, reauthenticate }}>
							<Trans comment="Link to backup-code verification flow when authenticator app is unavailable">
								Lost access to your authenticator?
							</Trans>
						</Link>
					}
				/>
			)}
		</>
	);
}

export function VerifyTwoFactorPage() {
	return <TwoFactorVerificationPage />;
}

export function VerifyTwoFactorBackupPage() {
	return <TwoFactorVerificationPage backupCode />;
}
