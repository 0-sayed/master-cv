import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Input } from "@reactive-resume/ui/components/input";
import { AuthErrorSummary } from "../components/auth-error-summary";
import { useAuthCopy } from "../copy.generated";
import { authErrorMessage } from "../errors";
import { authClient } from "@/libs/auth/client";

export function ForgotPasswordPage() {
	const copy = useAuthCopy();
	const [email, setEmail] = useState("");
	const [submitted, setSubmitted] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
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
	return (
		<>
			<div className="space-y-1">
				<h1 className="type-title-s lg:type-title">{copy(submitted ? "auth.reset.sentTitle" : "auth.reset.title")}</h1>
				<p className="text-sm leading-[23px] text-ink-2">
					{copy(submitted ? "auth.reset.sentHint" : "auth.reset.requestHint", { email })}
				</p>
			</div>
			<AuthErrorSummary message={error} field="reset-email" />
			{!submitted && (
				<form className="grid gap-5" onSubmit={submit}>
					<label className="grid gap-1.5 text-sm font-semibold">
						{copy("auth.email.label")}
						<Input
							className="h-12 px-4 font-normal"
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
					<Button type="submit" loading={pending} className="h-12">
						{copy("auth.reset.sendLink")}
					</Button>
				</form>
			)}
			<Link
				to="/auth/login"
				className="flex min-h-12 items-center justify-center gap-2 text-sm font-semibold text-accent-text"
			>
				<Icon name="arrow-left" size={18} />
				{copy("auth.navigation.backToSignIn")}
			</Link>
		</>
	);
}
