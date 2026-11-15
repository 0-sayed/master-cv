import { Trans } from "@lingui/react/macro";
import { createFileRoute, Link } from "@tanstack/react-router";
import { buttonVariants } from "@reactive-resume/ui/components/button";
import { PageHeader } from "@/components/layout/page-header";
import { HelpPage } from "@/features/help/page";
import { PublicShell } from "@/features/help/public-shell";
import { AppShell } from "@/routes/dashboard/-components/app-shell";

export const Route = createFileRoute("/help")({ component: HelpRoute });

export function HelpRoute() {
	// Root beforeLoad resolves the session before mounting this route, including deep links.
	const { session } = Route.useRouteContext();
	const title = <Trans context="help.page.title">Help and contact</Trans>;
	if (session)
		return (
			<AppShell>
				<PageHeader title={title} />
				<HelpPage />
			</AppShell>
		);
	return (
		<PublicShell
			title={title}
			headerActions={
				<>
					<Link to="/" className={buttonVariants({ variant: "link", size: "link-touch" })}>
						<Trans context="privacy.navigation.home">Back to home</Trans>
					</Link>
					<Link to="/auth/login" search={{ callbackURL: "/help" }} className={buttonVariants()}>
						<Trans>Sign in</Trans>
					</Link>
				</>
			}
		>
			<HelpPage />
		</PublicShell>
	);
}
