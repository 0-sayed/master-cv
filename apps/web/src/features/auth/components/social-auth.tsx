import type { RouterOutput } from "@/libs/orpc/client";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearch } from "@tanstack/react-router";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { toast } from "@reactive-resume/ui/components/toast";
import { cn } from "@reactive-resume/utils/style";
import { getAuthRedirectOptions, getOAuthPasskeyOptions, isOAuthRedirect } from "../redirect";
import { authClient } from "@/libs/auth/client";
import { ENTER_CLASS } from "@/libs/motion";
import { orpc } from "@/libs/orpc/client";
import { sessionQueryKey } from "@/libs/root-context";

export function SocialAuth({ intent = "sign-in" }: { intent?: "sign-in" | "sign-up" }) {
	const { data: discovered = {}, isLoading } = useQuery(orpc.auth.providers.list.queryOptions());
	// Keep launch advertising constrained even when discovery comes from an older server.
	const providers: SocialAuthButtonsProps["providers"] =
		intent === "sign-in" && discovered.passkey ? { passkey: discovered.passkey } : {};
	// Available providers have no known shape before discovery. Do not invent workspace-loading content in auth.
	if (isLoading || Object.keys(providers).length === 0) return null;

	return (
		<>
			<div className="flex items-center gap-x-2">
				<hr className="flex-1" />
				<span className="type-metadata font-medium">
					<Trans context="Choose to authenticate with a social provider (Google, GitHub, etc.) instead of email and password">
						or continue with
					</Trans>
				</span>
				<hr className="flex-1" />
			</div>

			<SocialAuthButtons />
		</>
	);
}

type SocialAuthButtonsProps = {
	providers: RouterOutput["auth"]["providers"]["list"];
};

function SocialAuthButtons() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const { callbackURL } = useSearch({ from: "/auth" });

	const runSignIn = async (
		fn: () => Promise<{ data?: unknown; error: { message?: string | undefined } | null }>,
		isPasskey = false,
	) => {
		const toastId = toast.add({ type: "loading", description: t`Signing in...` });
		const { data, error } = await fn();
		if (error) {
			toast.add({
				type: "error",
				description:
					error.message ||
					t({
						comment: "Fallback toast when sign-in fails without an error message",
						message: "Failed to sign in. Please try again.",
					}),
				id: toastId,
			});
			return;
		}
		toast.close(toastId);
		if (isOAuthRedirect(data)) return;
		await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
		await router.invalidate();
		if (isPasskey) void router.navigate(getAuthRedirectOptions(callbackURL));
	};

	return (
		<div className={cn(ENTER_CLASS, "grid gap-4")}>
			<Button
				size="lg"
				variant="secondary"
				onClick={() =>
					runSignIn(() => authClient.signIn.passkey({ autoFill: false, ...getOAuthPasskeyOptions(callbackURL) }), true)
				}
			>
				<Icon name="fingerprint" />
				<Trans comment="Label for passkey sign-in button">Passkey</Trans>
			</Button>
		</div>
	);
}
