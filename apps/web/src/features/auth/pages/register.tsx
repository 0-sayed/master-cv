import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { Input } from "@reactive-resume/ui/components/input";
import { AuthErrorSummary } from "../components/auth-error-summary";
import { AuthHeading } from "../components/auth-heading";
import { SocialAuth } from "../components/social-auth";
import { useAuthCopy } from "../copy.generated";
import { authErrorMessage } from "../errors";
import { verificationCallback } from "../redirect";
import { PasswordInput } from "@/components/input/password-input";
import { useUiLocale } from "@/features/locale/provider";
import { authClient } from "@/libs/auth/client";

export function RegisterPage({ disableEmailAuth }: { disableEmailAuth: boolean }) {
	const copy = useAuthCopy();
	const { locale } = useUiLocale();
	const { callbackURL, reauthenticate } = useSearch({ from: "/auth" });
	const navigate = useNavigate();
	const [value, setValue] = useState({ name: "", username: "", email: "", password: "" });
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		if (
			!value.name.trim() ||
			value.password.length < 8 ||
			value.password.length > 64 ||
			!event.currentTarget.checkValidity()
		) {
			setError(authErrorMessage(undefined));
			return;
		}
		setPending(true);
		try {
			const result = await authClient.signUp.email({
				...value,
				name: value.name.trim(),
				displayUsername: value.username,
				uiLocale: locale,
				callbackURL: verificationCallback(value.email, callbackURL),
			});
			if (result.error) {
				setError(authErrorMessage(result.error.code));
				return;
			}
			await navigate({ to: "/auth/verify-email", search: { email: value.email, callbackURL }, replace: true });
		} catch {
			setError(authErrorMessage(undefined));
		} finally {
			setPending(false);
		}
	}
	return (
		<>
			<div className="space-y-1">
				<AuthHeading>{copy("auth.signUp.title")}</AuthHeading>
				<p className="type-body text-ink-2">{copy("auth.signUp.subtitle")}</p>
			</div>
			<AuthErrorSummary message={error} field="register-email" />
			{!disableEmailAuth && (
				<form className="grid gap-(--space-18) lg:gap-5" onSubmit={submit}>
					<label htmlFor="register-name" className="grid gap-1.5 type-label">
						<Trans>Name</Trans>
						<Input
							size="lg"
							className="font-normal"
							id="register-name"
							name="name"
							autoComplete="name"
							required
							maxLength={64}
							value={value.name}
							onChange={(e) => setValue({ ...value, name: e.target.value })}
						/>
					</label>
					<label htmlFor="register-username" className="grid gap-1.5 type-label">
						<Trans>Username</Trans>
						<Input
							size="lg"
							className="font-normal"
							id="register-username"
							name="username"
							dir="ltr"
							autoComplete="username"
							required
							minLength={3}
							maxLength={64}
							pattern="[a-z0-9._\-]+"
							value={value.username}
							onChange={(e) => setValue({ ...value, username: e.target.value.toLowerCase() })}
						/>
					</label>
					<label className="grid gap-1.5 type-label">
						{copy("auth.email.label")}
						<Input
							size="lg"
							className="font-normal"
							id="register-email"
							name="email"
							dir="ltr"
							type="email"
							autoComplete="email"
							required
							value={value.email}
							onChange={(e) => setValue({ ...value, email: e.target.value })}
						/>
					</label>
					<label className="grid gap-1.5 type-label">
						<span id="register-password-label">{copy("common.fields.password")}</span>
						<PasswordInput
							embedded
							id="register-password"
							aria-labelledby="register-password-label"
							aria-describedby="register-password-hint"
							name="password"
							autoComplete="new-password"
							required
							minLength={8}
							maxLength={64}
							value={value.password}
							onChange={(e) => setValue({ ...value, password: e.target.value })}
						/>
						<span id="register-password-hint" className="type-metadata font-normal text-ink-3">
							{copy("auth.signUp.passwordHint")}
						</span>
					</label>
					<label className="flex min-h-11 items-center gap-2 type-body text-ink-2">
						<input type="checkbox" required className="size-4 accent-accent" />
						{copy("auth.signUp.consent")}
					</label>
					<Button type="submit" loading={pending} size="lg" className="w-full">{t`Sign up`}</Button>
				</form>
			)}
			<SocialAuth />
			<p className="type-body text-ink-2">
				<Trans>Already have an account?</Trans>{" "}
				<Link
					className="font-semibold text-accent-text underline"
					to="/auth/login"
					search={{ callbackURL, reauthenticate }}
				>
					<Trans>Sign in</Trans>
				</Link>
			</p>
		</>
	);
}
