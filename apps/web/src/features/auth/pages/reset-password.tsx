import { t } from "@lingui/core/macro";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { AuthErrorSummary } from "../components/auth-error-summary";
import { useAuthCopy } from "../copy.generated";
import { authErrorMessage } from "../errors";
import { PasswordInput } from "@/components/input/password-input";
import { authClient } from "@/libs/auth/client";

export function ResetPasswordPage({ token }: { token: string }) {
	const copy = useAuthCopy();
	const navigate = useNavigate();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [password, setPassword] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [invalid, setInvalid] = useState(false);
	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		if (password !== confirmation) {
			setError(t`Passwords do not match.`);
			return;
		}
		setPending(true);
		try {
			const result = await authClient.resetPassword({ token, newPassword: password });
			if (result.error) {
				setError(authErrorMessage(result.error.code));
				if (result.error.code === "INVALID_TOKEN" || result.error.code === "TOKEN_EXPIRED") setInvalid(true);
				return;
			}
			queryClient.clear();
			await router.invalidate();
			await navigate({ to: "/auth/login", search: { reason: "passwordChanged" }, replace: true });
		} catch {
			setError(authErrorMessage(undefined));
		} finally {
			setPending(false);
		}
	}
	return (
		<>
			<div className="space-y-1">
				<h1 className="type-title-s lg:type-title">{copy("auth.password.newLabel")}</h1>
				<p className="text-sm leading-[23px] text-ink-2">{copy("auth.password.newHint")}</p>
			</div>
			<AuthErrorSummary message={error} field={invalid ? undefined : "confirm-password"} />
			{invalid ? (
				<Link to="/auth/forgot-password" className="text-accent-text underline">
					{copy("auth.reset.sendLink")}
				</Link>
			) : (
				<form className="grid gap-5" onSubmit={submit}>
					<label className="grid gap-1.5 text-sm font-semibold">
						{copy("auth.password.newLabel")}
						<PasswordInput
							embedded
							name="password"
							autoComplete="new-password"
							required
							minLength={8}
							maxLength={64}
							value={password}
							onChange={(e) => setPassword(e.target.value)}
						/>
						<span className="text-xs font-normal text-ink-3">{copy("auth.password.requirementsHint")}</span>
					</label>
					<label className="grid gap-1.5 text-sm font-semibold">
						{copy("auth.password.confirmLabel")}
						<PasswordInput
							embedded
							id="confirm-password"
							name="confirmation"
							autoComplete="new-password"
							required
							minLength={8}
							maxLength={64}
							value={confirmation}
							onChange={(e) => setConfirmation(e.target.value)}
						/>
					</label>
					<Button type="submit" loading={pending} className="h-12">
						{copy("auth.password.save")}
					</Button>
				</form>
			)}
		</>
	);
}
