import { Trans } from "@lingui/react/macro";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";
import { HelpPage } from "@/features/help/page";
import { PublicHelp } from "@/features/help/public-page";
import { getPublicPageMeta, createNoindexFollowMeta } from "@/libs/seo";
import { AppShell } from "@/routes/dashboard/-components/app-shell";

export const Route = createFileRoute("/help")({
	head: () => {
		const { title, description } = getPublicPageMeta("help");
		return { meta: [{ title }, { name: "description", content: description }, createNoindexFollowMeta()] };
	},
	component: HelpRoute,
});

export function HelpRoute() {
	// Root beforeLoad resolves the session before mounting this route, including deep links.
	const { session } = Route.useRouteContext();
	const title = <Trans context="help.page.title">Help and contact</Trans>;
	if (session)
		return (
			<AppShell>
				<PageHeader title={title} />
				<HelpPage user={session?.user ?? null} />
			</AppShell>
		);
	return <PublicHelp />;
}
