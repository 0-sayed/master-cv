import { Trans } from "@lingui/react/macro";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { Button, buttonVariants } from "@reactive-resume/ui/components/button";
import { StatusCard } from "@reactive-resume/ui/components/status-card";
import { PublicShell } from "@/features/help/public-shell";
import { PrivacyNotice } from "@/features/settings/privacy/notice";
import { authClient } from "@/libs/auth/client";
import { client, orpc } from "@/libs/orpc/client";

const statuses = [
	"confirmed_old",
	"verification_sent",
	"complete",
	"delivery_failed",
	"invalid",
	"expired",
	"cancelled",
] as const;
type EmailChangeStatus = (typeof statuses)[number];
export const Route = createFileRoute("/email-change")({
	validateSearch: (search: Record<string, unknown>): { status: EmailChangeStatus } => ({
		status: statuses.includes(search.status as EmailChangeStatus) ? (search.status as EmailChangeStatus) : "invalid",
	}),
	component: EmailChangeResult,
});
function EmailChangeResult() {
	const { status } = Route.useSearch();
	const { session } = useRouteContext({ strict: false });
	const signedIn = !!session;
	const security = useQuery({
		...orpc.privacy.security.queryOptions(),
		enabled: signedIn && status !== "complete",
		retry: false,
	});
	// A confirmation changes the server session before this route; do not show a cached previous address.
	const current = useQuery({
		queryKey: ["email-change", "session", status],
		enabled: signedIn && status === "complete",
		queryFn: async () => {
			const result = await authClient.getSession({ query: { disableCookieCache: true } });
			if (result.error) throw result.error;
			return result.data;
		},
	});
	const resend = useMutation({ mutationFn: () => client.privacy.resendEmailChange() });
	const pending = status === "confirmed_old" || status === "verification_sent" || resend.isSuccess;
	const complete = status === "complete";
	const failed = status === "delivery_failed" && !resend.isSuccess;
	const address = complete
		? current.data?.user.email
		: pending || failed
			? security.data?.pendingEmail?.confirmationAddress
			: undefined;
	const canResend = signedIn && !!security.data?.pendingEmail;
	return (
		<PublicShell focused statusPage>
			<StatusCard
				tone={complete || pending ? "accent" : "warn"}
				icon={complete ? "check-circle" : pending ? "envelope" : "warning"}
				title={
					complete ? (
						<Trans>Email changed</Trans>
					) : pending ? (
						<Trans>Check your new inbox</Trans>
					) : failed ? (
						<Trans>We couldn't send the email</Trans>
					) : (
						<Trans>Email link is unavailable</Trans>
					)
				}
				actions={
					complete ? (
						<Link
							to={signedIn ? "/dashboard/settings/account" : "/auth/login"}
							className={buttonVariants({ variant: "primary" })}
						>
							{signedIn ? <Trans>Go to account settings</Trans> : <Trans>Sign in</Trans>}
						</Link>
					) : (pending || failed) && canResend ? (
						<Button loading={resend.isPending} onClick={() => resend.mutate()}>
							{failed ? <Trans>Try again</Trans> : <Trans>Resend</Trans>}
						</Button>
					) : (
						<Link to="/dashboard/settings/account" className={buttonVariants({ variant: "primary" })}>
							{failed ? (
								<Trans>Try again</Trans>
							) : pending ? (
								<Trans>Go to account settings</Trans>
							) : (
								<Trans>Start again</Trans>
							)}
						</Link>
					)
				}
				secondary={
					<Link to="/help" className={buttonVariants({ variant: "link", size: "link-touch" })}>
						<Trans context="workspace.privacy.b79cac926e0b">Help</Trans>
					</Link>
				}
			>
				<p>
					{complete ? (
						<Trans>Your new email is verified and ready to use for signing in.</Trans>
					) : pending ? (
						<Trans>Confirm the link in your new inbox to finish changing your email.</Trans>
					) : failed ? (
						<Trans>Your current email is unchanged. Request another message from account settings.</Trans>
					) : status === "cancelled" ? (
						<Trans>This email change was cancelled. Start again from account settings.</Trans>
					) : status === "expired" ? (
						<Trans>This link has expired. Start again from account settings.</Trans>
					) : (
						<Trans>This link is invalid or no longer available. Start again from account settings.</Trans>
					)}
				</p>
				{address && (
					<bdi dir="ltr" className="type-label text-ink">
						{address}
					</bdi>
				)}
				{pending && (
					<p>
						<Trans context="workspace.privacy.d100504410ec">
							Your current email stays active until the change is verified.
						</Trans>
					</p>
				)}
				{!signedIn && (complete || pending || failed) && (
					<p>
						<Trans>Sign in to see the email address involved.</Trans>
					</p>
				)}
				{(security.isError || current.isError) && (
					<PrivacyNotice error title={<Trans>Email details are unavailable</Trans>}>
						<Trans>Open account settings to check the current address and pending change.</Trans>
					</PrivacyNotice>
				)}
				{resend.isSuccess && (
					<p role="status">
						<Trans>Confirmation email sent. Check your inbox.</Trans>
					</p>
				)}
				{resend.isError && (
					<PrivacyNotice error title={<Trans>Email could not be sent</Trans>}>
						<Trans>Try again from account settings.</Trans>
					</PrivacyNotice>
				)}
			</StatusCard>
		</PublicShell>
	);
}
