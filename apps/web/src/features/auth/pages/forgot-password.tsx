import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button, buttonVariants } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Input } from "@reactive-resume/ui/components/input";
import { AuthErrorSummary } from "../components/auth-error-summary";
import { AuthHeading } from "../components/auth-heading";
import { useAuthCopy } from "../copy.generated";
import { authErrorMessage } from "../errors";
import { authClient } from "@/libs/auth/client";

export function ForgotPasswordPage() {
	const copy = useAuthCopy();
	const [email, setEmail] = useState("");
	const [submitted, setSubmitted] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	async function requestReset() {
		setError(null);
		setPending(true);
		try {
			const result = await authClient.requestPasswordReset({ email, redirectTo: "/auth/reset-password" });
			if (result.error) {
				setError(authErrorMessage(result.error.code));
				return;
			}
			setSubmitted(true);
		} catch {
			setError(authErrorMessage(undefined));
		} finally {
			setPending(false);
		}
	}
	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		await requestReset();
	}
	return (
		<>
			<div className="space-y-1">
				<AuthHeading>{copy(submitted ? "auth.reset.sentTitle" : "auth.reset.title")}</AuthHeading>
				<p className="type-body text-ink-2">
					{copy(submitted ? "auth.reset.sentHint" : "auth.reset.requestHint", { email })}
				</p>
			</div>
			<AuthErrorSummary message={error} field={submitted ? undefined : "reset-email"} />
			{!submitted && (
				<form className="grid gap-5" onSubmit={submit}>
					<label className="grid gap-1.5 type-label">
						{copy("auth.email.label")}
						<Input
							size="lg"
							className="font-normal"
							id="reset-email"
							type="email"
							name="email"
							dir="ltr"
							autoComplete="email"
							required
							value={email}
							onChange={(e) => setEmail(e.target.value)}
						/>
					</label>
					<Button type="submit" loading={pending} size="lg">
						{copy("auth.reset.sendLink")}
					</Button>
				</form>
			)}
			{submitted && (
				<Button variant="secondary" loading={pending} onClick={() => void requestReset()}>
					{copy("auth.verifyEmail.resend")}
				</Button>
			)}
			<Link to="/auth/login" className={buttonVariants({ variant: "link", size: "link-touch" })}>
				<Icon name="arrow-left" size={18} />
				{copy("auth.navigation.backToSignIn")}
			</Link>
		</>
	);
}
