import { Trans } from "@lingui/react/macro";
import { Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { AuthErrorSummary } from "../components/auth-error-summary";
import { useAuthCopy } from "../copy.generated";
import { authErrorMessage } from "../errors";
import { verificationCallback } from "../redirect";
import { authClient } from "@/libs/auth/client";

export function VerifyEmailPage() {
	const { email, error: tokenError } = useSearch({ from: "/auth/verify-email" });
	const { callbackURL } = useSearch({ from: "/auth" });
	const copy = useAuthCopy();
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [remaining, setRemaining] = useState(0);
	useEffect(() => {
		if (!remaining) return;
		const timer = setTimeout(() => setRemaining((value) => value - 1), 1000);
		return () => clearTimeout(timer);
	}, [remaining]);
	async function resend() {
		if (!email) return;
		setPending(true);
		setError(null);
		try {
			const result = await authClient.sendVerificationEmail({
				email,
				callbackURL: verificationCallback(email, callbackURL),
			});
			if (result.error) {
				setError(authErrorMessage(result.error.code));
				return;
			}
			setRemaining(60);
		} catch {
			setError(authErrorMessage(undefined));
		} finally {
			setPending(false);
		}
	}
	return (
		<>
			<div className="grid size-14 place-items-center self-center rounded-full bg-accent-soft text-accent-text">
				<Icon name="envelope-simple" size={24} />
			</div>
			<div className="space-y-1 text-center">
				<h1 className="type-title-s lg:type-title">
					{copy(tokenError ? "auth.verifyEmail.error.expiredTitle" : "auth.verifyEmail.title")}
				</h1>
				<p className="text-sm leading-[23px] text-ink-2">
					{email
						? copy(tokenError ? "auth.verifyEmail.error.expiredHint" : "auth.verifyEmail.sentToHint", {
								email: `\u2066${email}\u2069`,
							})
						: copy("auth.verifyEmail.securityHint")}
				</p>
			</div>
			<AuthErrorSummary message={error} />
			<div className="grid gap-1 rounded-xl bg-info-soft p-4 text-sm leading-[23px] text-info-text">
				<h2 className="flex items-center gap-1.5 font-semibold">
					<Icon name="info" size={16} />
					{copy("auth.verifyEmail.deliveryTitle")}
				</h2>
				<p>{copy("auth.verifyEmail.deliveryHint")}</p>
				<p>{copy("auth.verifyEmail.expiryHint")}</p>
			</div>
			{email && (
				<Button
					variant="secondary"
					className="h-12"
					onClick={() => void resend()}
					loading={pending}
					disabled={remaining > 0}
				>
					<Icon name="arrows-clockwise" size={18} />
					{copy("auth.verifyEmail.resend")}
					{remaining > 0 ? ` (${remaining})` : ""}
				</Button>
			)}
			<div aria-live="polite" className="text-sm text-ink-2">
				{remaining > 0 && <Trans>Verification email requested. Check your inbox.</Trans>}
			</div>
			<Link to="/auth/login" search={{ callbackURL }} className="text-center text-sm text-accent-text underline">
				{copy("auth.navigation.backToSignIn")}
			</Link>
			<Link
				to="/auth/register"
				search={{ callbackURL }}
				className="inline-flex min-h-12 items-center justify-center gap-1 text-center text-sm font-semibold text-accent-text"
			>
				<span className="font-normal text-ink-2">{copy("auth.verifyEmail.wrongAddress")}</span>
				{copy("auth.verifyEmail.changeAddress")}
			</Link>
		</>
	);
}
