import type { QueryClient } from "@tanstack/react-query";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useSelector } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import z from "zod";
import { Button } from "@reactive-resume/ui/components/button";
import { FormControl, FormDescription, FormItem, FormLabel, FormMessage } from "@reactive-resume/ui/components/form";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Input } from "@reactive-resume/ui/components/input";
import { toast } from "@reactive-resume/ui/components/toast";
import { AuthErrorSummary } from "../components/auth-error-summary";
import { SocialAuth } from "../components/social-auth";
import { useAuthCopy } from "../copy.generated";
import { authErrorMessage } from "../errors";
import {
	getAuthRedirectOptions,
	getOAuthCreationOptions,
	getOAuthPasskeyOptions,
	getOAuthSignInOptions,
	isOAuthRedirect,
} from "../redirect";
import { PasswordInput } from "@/components/input/password-input";
import { authClient } from "@/libs/auth/client";
import { orpc } from "@/libs/orpc/client";
import { sessionQueryKey } from "@/libs/root-context";
import { useAppForm } from "@/libs/tanstack-form";

const formSchema = z.object({
	identifier: z.string().trim().toLowerCase(),
	password: z.string().min(6).max(64),
});

type Props = {
	disableEmailAuth: boolean;
	disableSignups: boolean;
	allowGuestLogin: boolean;
};

type SubmitLoginOptions = {
	onError: (code: string | undefined) => void;
	value: z.infer<typeof formSchema>;
	callbackURL: string | undefined;
	navigate: ReturnType<typeof useNavigate>;
	queryClient: QueryClient;
	router: ReturnType<typeof useRouter>;
};

async function submitLogin({ value, callbackURL, navigate, queryClient, router, onError }: SubmitLoginOptions) {
	const toastId = toast.add({ type: "loading", description: t`Signing in...` });

	try {
		const isEmail = value.identifier.includes("@");
		const creation = getOAuthCreationOptions(callbackURL);

		const result = isEmail
			? await authClient.signIn.email({
					email: value.identifier,
					password: value.password,
					...(creation ? {} : getOAuthSignInOptions(callbackURL)),
				})
			: await authClient.signIn.username({
					username: value.identifier,
					password: value.password,
					...(creation ? {} : getOAuthSignInOptions(callbackURL)),
				});

		if (result.error) {
			toast.close(toastId);
			if (result.error.code === "EMAIL_NOT_VERIFIED" && isEmail) {
				await navigate({ to: "/auth/verify-email", search: { email: value.identifier, callbackURL }, replace: true });
				return;
			}
			onError(result.error.code);
			return;
		}

		const requiresTwoFactor =
			result.data &&
			typeof result.data === "object" &&
			"twoFactorRedirect" in result.data &&
			result.data.twoFactorRedirect;

		if (requiresTwoFactor) {
			toast.close(toastId);
			// The auth client's two-factor hook already started the document redirect.
			return;
		}

		toast.close(toastId);
		if (isOAuthRedirect(result.data)) return;
		if (creation) {
			const continuation = await authClient.oauth2.continue(creation);
			if (continuation.error) {
				onError(continuation.error.code);
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
		onError(undefined);
	}
}

export function LoginPage({ disableEmailAuth, disableSignups, allowGuestLogin }: Props) {
	const router = useRouter();
	const { callbackURL, reauthenticate, reason } = useSearch({ from: "/auth" });
	const copy = useAuthCopy();
	const [error, setError] = useState<string | null>(null);
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const hasStartedConditionalPasskeyRef = useRef(false);

	const { data: providers = {} } = useQuery(orpc.auth.providers.list.queryOptions());

	const form = useAppForm({
		defaultValues: { identifier: "", password: "" },
		validators: { onSubmit: formSchema },
		onSubmit: async ({ value }) => {
			setError(null);
			await submitLogin({
				value,
				callbackURL,
				navigate,
				queryClient,
				router,
				onError: (code) => setError(authErrorMessage(code)),
			});
		},
	});

	const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);

	const guestSignIn = useMutation({
		mutationFn: async () => {
			const { error } = await authClient.signIn.anonymous();
			if (error) throw new Error(error.message);
			await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
			await router.invalidate();
			void navigate(getAuthRedirectOptions(callbackURL));
		},
		onError: (error) =>
			toast.add({ type: "error", description: error.message || t`Couldn't continue as a guest. Please try again.` }),
	});

	useEffect(() => {
		if (!("passkey" in providers)) return;
		if (!("PublicKeyCredential" in window)) return;
		if (!PublicKeyCredential.isConditionalMediationAvailable) return;
		if (hasStartedConditionalPasskeyRef.current) return;

		hasStartedConditionalPasskeyRef.current = true;

		void PublicKeyCredential.isConditionalMediationAvailable().then(async (isAvailable) => {
			if (!isAvailable) return;

			const { data, error } = await authClient.signIn.passkey({
				autoFill: true,
				...getOAuthPasskeyOptions(callbackURL),
			});
			if (error || isOAuthRedirect(data)) return;

			await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
			await router.invalidate();
			void navigate(getAuthRedirectOptions(callbackURL));
		});
	}, [providers, router, navigate, callbackURL, queryClient]);

	return (
		<>
			<div className="space-y-1 text-start">
				<h1 className="type-title-s lg:type-title">{copy("common.navigation.signIn")}</h1>
				<p className="text-sm leading-[23px] text-ink-2">{copy("editor.documents.subtitle")}</p>
			</div>
			{reason && (
				<div role="status" className="rounded-xl border border-line bg-bg p-4">
					<h2 className="flex items-center gap-2 font-semibold">
						<Icon
							name={reason === "passwordChanged" ? "check-circle" : reason === "sessionExpired" ? "warning" : "clock"}
						/>
						{copy(
							reason === "passwordChanged"
								? "auth.password.changedTitle"
								: reason === "sessionExpired"
									? "auth.session.expiredTitle"
									: "auth.verifyEmail.error.expiredTitle",
						)}
					</h2>
					<p className="text-sm text-ink-2">
						{copy(
							reason === "passwordChanged"
								? "auth.password.changedHint"
								: reason === "sessionExpired"
									? "auth.session.expiredHint"
									: "auth.verifyEmail.expiryHint",
						)}
					</p>
				</div>
			)}
			<AuthErrorSummary message={error} field="login-password" />

			{!disableEmailAuth && (
				<form
					className="space-y-[18px] lg:space-y-5"
					onSubmit={(event) => {
						event.preventDefault();
						event.stopPropagation();
						void form.handleSubmit();
					}}
				>
					<form.Field name="identifier">
						{(field) => (
							<FormItem className="gap-1.5" hasError={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
								<FormLabel className="text-sm leading-[22px] font-semibold text-ink">
									{copy("auth.email.label")}
								</FormLabel>
								<FormControl
									render={
										<Input
											autoComplete="section-login username webauthn"
											placeholder="john.doe@example.com"
											className="h-12 px-4 lowercase"
											dir="ltr"
											name={field.name}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(event) => field.handleChange(event.target.value)}
										/>
									}
								/>
								<FormMessage errors={field.state.meta.errors} />
								<FormDescription>
									<Trans>You can also sign in with your username.</Trans>
								</FormDescription>
							</FormItem>
						)}
					</form.Field>

					<form.Field name="password">
						{(field) => (
							<FormItem className="gap-1.5" hasError={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
								<div className="flex items-center justify-between">
									<FormLabel
										htmlFor="login-password"
										id="login-password-label"
										className="text-sm leading-[22px] font-semibold text-ink"
									>
										<Trans comment="Label for password input on login form">Password</Trans>
									</FormLabel>
								</div>
								<FormControl
									render={
										<PasswordInput
											embedded
											id="login-password"
											aria-labelledby="login-password-label"
											minLength={6}
											maxLength={64}
											autoComplete="section-login current-password"
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
					</form.Field>

					<div className="flex justify-start">
						<Button
							variant="link"
							nativeButton={false}
							className="min-h-12 px-1 py-0 text-sm font-semibold"
							render={<Link to="/auth/forgot-password">{copy("auth.signIn.forgotPassword")}</Link>}
						/>
					</div>
					<Button type="submit" className="h-12 w-full" disabled={isSubmitting}>
						{copy("common.navigation.signIn")}
					</Button>
				</form>
			)}

			<SocialAuth />
			{!disableSignups && (
				<div className="flex min-h-12 items-center gap-1 text-sm text-ink-2">
					{copy("auth.signIn.createAccountHint")}
					<Link
						to="/auth/register"
						search={{ callbackURL, reauthenticate }}
						className="inline-flex min-h-12 items-center px-1 font-semibold text-accent-text"
					>
						{copy("auth.signUp.title")}
					</Link>
				</div>
			)}

			{allowGuestLogin && (
				<Button
					type="button"
					variant="secondary"
					className="w-full"
					loading={guestSignIn.isPending}
					onClick={() => guestSignIn.mutate()}
				>
					<Trans>Continue as guest</Trans>
				</Button>
			)}
		</>
	);
}
