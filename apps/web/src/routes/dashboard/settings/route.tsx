import type { IconName } from "@reactive-resume/ui/components/icon";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Icon } from "@reactive-resume/ui/components/icon";
import { PageHeader } from "@/components/layout/page-header";

type Page = {
	to: "/dashboard/settings/account" | "/dashboard/settings/preferences" | "/dashboard/settings/ai";
	icon: IconName;
	label: () => string;
};

// Six pages became three, each with one job (README §5.9).
const SETTINGS_PAGES: Page[] = [
	{
		to: "/dashboard/settings/account",
		icon: "user-circle",
		label: () => t({ message: "Account", context: "account.settings.accountTab" }),
	},
	{
		to: "/dashboard/settings/preferences",
		icon: "sliders-horizontal",
		label: () => t({ message: "Preferences", context: "account.preferences.title" }),
	},
];

export const Route = createFileRoute("/dashboard/settings")({ component: RouteComponent });

function RouteComponent() {
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const isRoot = pathname.replace(/\/$/, "") === "/dashboard/settings";
	const current = SETTINGS_PAGES.find((page) => page.to === pathname.replace(/\/$/, ""));

	return (
		<div className="contents">
			<PageHeader
				backOnlyOnMobile
				title={current?.label() ?? t({ message: "Settings", context: "account.navigation.settings" })}
				description={
					pathname.endsWith("/ai") ? (
						<Trans>Connect the tools you use for writing, job search and working with your resumes.</Trans>
					) : undefined
				}
				back={
					!isRoot ? (
						<Link to="/dashboard/settings" className="inline-flex items-center gap-1 type-body text-ink-2 sm:hidden">
							<Icon name="caret-left" size={20} />
							<Trans context="account.navigation.settings">Settings</Trans>
						</Link>
					) : undefined
				}
			/>
			<nav
				aria-label={t({ message: "Settings", context: "account.navigation.settings" })}
				className="min-w-0 border-b border-line [view-transition-name:settings-nav] max-sm:hidden"
			>
				<div className="flex flex-wrap gap-1 pb-2">
					{SETTINGS_PAGES.map((page) => (
						<Link
							key={page.to}
							to={page.to}
							className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg px-2.5 type-label text-ink-2 transition-colors duration-quick hover:bg-hover"
							activeProps={{ className: "bg-sunken text-ink", "aria-current": "page" }}
						>
							<Icon name={page.icon} size={20} />
							{page.label()}
						</Link>
					))}
				</div>
			</nav>

			<div className="grid min-w-0 gap-8">
				<Outlet />
			</div>
		</div>
	);
}
