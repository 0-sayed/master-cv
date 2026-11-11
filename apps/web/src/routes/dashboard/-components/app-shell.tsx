import type { IconName } from "@reactive-resume/ui/components/icon";
import type { ReactNode } from "react";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useQuery } from "@tanstack/react-query";
import { Link, useMatchRoute, useRouteContext, useRouterState } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "@reactive-resume/ui/components/avatar";
import { CountBadge } from "@reactive-resume/ui/components/badge";
import { BrandIcon } from "@reactive-resume/ui/components/brand-icon";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { useSkeletonLoading } from "@reactive-resume/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@reactive-resume/ui/components/tooltip";
import { useBreakpoint } from "@reactive-resume/ui/hooks/use-breakpoint";
import { getInitials } from "@reactive-resume/utils/string";
import { cn } from "@reactive-resume/utils/style";
import { dashboardWidth } from "@/components/layout/dashboard-width";
import { MobileTabIndicator } from "@/components/layout/mobile-tab-indicator";
import { DashboardHeader, DashboardPage } from "@/components/layout/page-header";
import { QuerySkeleton } from "@/components/query-skeleton";
import { useDialogStore } from "@/dialogs/store";
import { applicationsListQueryOptions } from "@/features/applications/queries";
import { GuestBanner } from "@/features/auth/components/guest-banner";
import { useCareerCopy } from "@/features/career/copy.generated";
import { CommandPaletteTrigger } from "@/features/command-palette/trigger";
import { useDocumentsCopy } from "@/features/documents/copy.generated";
import { LocaleSwitch } from "@/features/locale/switch";
import { isEditableElementFocused } from "@/features/resume/builder/draft";
import { ThemeToggleButton } from "@/features/theme/toggle-button";
import { UserDropdownMenu } from "@/features/user/dropdown-menu";
import { useSidebarPreference } from "@/hooks/use-sidebar-preference";
import { orpc } from "@/libs/orpc/client";

type NavItem = {
	to:
		| "/dashboard"
		| "/dashboard/applications"
		| "/dashboard/career/information"
		| "/dashboard/trash"
		| "/dashboard/settings";
	icon: IconName;
	label: string;
	count?: number;
	countLoading?: boolean;
};

function useNavItems() {
	const copy = useDocumentsCopy();
	const { data: counts } = useQuery(orpc.documents.counts.queryOptions());
	const { data: applications } = useQuery(applicationsListQueryOptions());

	const items: NavItem[] = [
		{
			to: "/dashboard",
			icon: "files",
			label: copy("editor.navigation.documentsTitle"),
			...(counts ? { count: counts.resume + counts.letter } : { countLoading: true }),
		},
		{
			to: "/dashboard/applications",
			icon: "briefcase",
			label: t({ message: "Applications", context: "editor.navigation.applications" }),
			...(applications
				? { count: applications.filter((application) => application.status !== "closed").length }
				: { countLoading: true }),
		},
	];

	// Career counts what's waiting for the user (unread notifications), so nothing shows at zero.
	items.splice(1, 0, {
		to: "/dashboard/career/information",
		icon: "user",
		label: t({ message: "Career information", context: "editor.navigation.career" }),
	});
	const settings: NavItem = {
		to: "/dashboard/settings",
		icon: "gear-six",
		label: t({ message: "Settings", context: "account.navigation.settings" }),
	};
	const trash: NavItem | null = counts?.trash
		? { to: "/dashboard/trash", icon: "trash", label: t`Trash`, count: counts.trash }
		: null;

	return { items, settings, trash };
}

/** Whether the item is the current page: Documents is exact, the others match their section. */
function useIsCurrent() {
	const matchRoute = useMatchRoute();
	return (to: NavItem["to"]) => Boolean(matchRoute({ to, fuzzy: to !== "/dashboard" }));
}

/**
 * The app shell for Documents, Trash, Applications and Settings: a collapsible 236px sidebar at ≥1024, an icon rail at
 * 640–1023 and a bottom tab bar below 640. An application's workspace is full screen on phones, with its own back
 * link and action bar, so it has no tab bar. N opens New anywhere outside a field.
 */
type AppShellProps = { children: ReactNode };

export function AppShell({ children }: AppShellProps) {
	const copy = useDocumentsCopy();
	const careerCopy = useCareerCopy();
	const breakpoint = useBreakpoint();
	const { session } = useRouteContext({ from: "/dashboard" });
	const { collapsed, toggle } = useSidebarPreference(session.user.id);
	const desktop = breakpoint === "desktop" || breakpoint === "wide";
	const rail = breakpoint === "tablet" || (desktop && collapsed);
	const openDialog = useDialogStore((state) => state.openDialog);
	const matchRoute = useMatchRoute();
	const welcome = Boolean(matchRoute({ to: "/dashboard/welcome" }));
	const careerInformation = Boolean(matchRoute({ to: "/dashboard/career/information" }));
	// Select the destination width before its outlet mounts, including the Settings index redirect.
	const pageWidth = useRouterState({
		select: (state) => dashboardWidth(state.location.pathname),
	});
	const documents = Boolean(matchRoute({ to: "/dashboard", fuzzy: false }));
	const workspaceTitle = careerInformation
		? t({ message: "Career information", context: "editor.navigation.career" })
		: copy("editor.navigation.documentsTitle");
	const mobileTitle = careerInformation ? careerCopy("editor.career.title") : workspaceTitle;
	const mobileWorkspace =
		breakpoint === "mobile" &&
		Boolean(matchRoute({ to: "/dashboard/applications/$applicationId/{-$tab}", fuzzy: true }));
	const tabs = breakpoint === "mobile" && !mobileWorkspace;

	useHotkey("N", () => {
		if (isEditableElementFocused() || useDialogStore.getState().open) return;
		openDialog("document.new", undefined);
	});
	if (welcome)
		return (
			<div className="flex min-h-svh flex-col bg-bg">
				<header className="flex h-16 shrink-0 items-center justify-between border-b border-line bg-surface dashboard-inline lg:h-18">
					<BrandIcon variant="logo" />
					<LocaleSwitch />
				</header>
				<main id="main-content" className="min-w-0 flex-1">
					<DashboardPage centered width="form">
						{children}
					</DashboardPage>
				</main>
			</div>
		);

	return (
		<div
			className={cn(
				"grid h-svh min-h-0 overflow-hidden bg-bg",
				breakpoint === "mobile"
					? tabs
						? "grid-rows-[minmax(0,1fr)_auto]"
						: ""
					: rail
						? "grid-cols-[64px_minmax(0,1fr)]"
						: "grid-cols-[var(--app-sidebar)_minmax(0,1fr)]",
			)}
		>
			<a
				href="#main-content"
				className="sr-only rounded-md bg-raised px-4 py-2 type-body focus:not-sr-only focus:absolute focus:inset-s-2 focus:top-2 focus:z-[100]"
			>
				<Trans>Skip to main content</Trans>
			</a>
			{breakpoint !== "mobile" && (rail ? <Rail toggle={desktop ? toggle : undefined} /> : <Sidebar toggle={toggle} />)}
			<main id="main-content" className="min-h-0 min-w-0 [scrollbar-gutter:stable] overflow-y-auto">
				{!mobileWorkspace && (
					<DashboardHeader
						width="wide"
						search={<CommandPaletteTrigger compact={breakpoint === "mobile"} />}
						start={
							breakpoint === "mobile" && (documents || careerInformation) ? (
								<div className="me-auto flex items-center gap-3">
									<span className="mobile-brand-slot">
										<BrandIcon variant="icon" alt="" />
									</span>
									<span className="type-section">{mobileTitle}</span>
								</div>
							) : null
						}
					>
						<LocaleSwitch />
						<div className={breakpoint === "mobile" && (documents || careerInformation) ? "hidden" : "contents"}>
							<ThemeToggleButton size="header-icon" />
						</div>
					</DashboardHeader>
				)}
				<GuestBanner />
				<DashboardPage width={pageWidth} fullScreenOnMobile={mobileWorkspace}>
					{children}
				</DashboardPage>
			</main>
			{tabs && <MobileTabs />}
		</div>
	);
}

function SidebarToggle({ collapsed, toggle }: { collapsed: boolean; toggle: () => void }) {
	const label = collapsed ? t`Expand sidebar` : t`Collapse sidebar`;
	return (
		<Tooltip>
			<TooltipTrigger
				data-slot="sidebar-toggle"
				render={
					<Button
						data-slot="sidebar-toggle"
						className="sidebar-border-toggle absolute"
						size="sidebar-toggle"
						variant="sidebar-toggle"
						aria-label={label}
						aria-expanded={!collapsed}
						onClick={toggle}
					/>
				}
			>
				<span data-slot="sidebar-toggle-circle" className="sidebar-toggle-circle">
					<Icon name={collapsed ? "caret-right" : "caret-left"} size={16} />
				</span>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

/** Expanded and rail navigation share every vertical dimension, including the account row. */
function SidebarFrame({ rail = false, children }: { rail?: boolean; children: ReactNode }) {
	return (
		<aside
			aria-label={t`App navigation`}
			className={cn(
				"sticky top-0 flex h-svh flex-col gap-1 border-e border-line bg-surface pb-3 [view-transition-name:app-nav]",
				rail ? "items-center" : "px-(--app-sidebar-inset)",
			)}
		>
			{children}
		</aside>
	);
}

function Sidebar({ toggle }: { toggle: () => void }) {
	const { items, settings, trash } = useNavItems();
	const isCurrent = useIsCurrent();

	return (
		<SidebarFrame>
			<div>
				<Link to="/" className="shell-brand-row sidebar-brand-inset">
					<BrandIcon variant="logo" />
				</Link>
				<SidebarToggle collapsed={false} toggle={toggle} />
			</div>

			<nav aria-label={t`App`} className="grid gap-0.5">
				{items.map((item) => (
					<NavLink key={item.to} item={item} current={isCurrent(item.to)} />
				))}
			</nav>

			<div className="mt-auto grid gap-2">
				{trash && <NavLink item={trash} current={isCurrent(trash.to)} />}
				<NavLink item={settings} current={isCurrent(settings.to)} />
				<UserDropdownMenu>
					{({ session }) => (
						<button
							type="button"
							className="flex h-16 items-center gap-2.5 rounded-lg px-2.5 py-2 text-start transition-colors duration-quick hover:bg-hover"
						>
							<Avatar size="sidebar">
								<AvatarImage src={session.user.image ?? undefined} />
								<AvatarFallback>{getInitials(session.user.name)}</AvatarFallback>
							</Avatar>
							<span className="grid min-w-0 flex-1">
								<span className="truncate type-body font-medium">{session.user.name}</span>
								<span className="type-metadata text-ink-3">
									<Trans context="account.settings.accountTab">Account</Trans>
								</span>
							</span>
						</button>
					)}
				</UserDropdownMenu>
			</div>
		</SidebarFrame>
	);
}

function NavLink({ item, current }: { item: NavItem; current: boolean }) {
	const skeletonWait1 = useSkeletonLoading(Boolean(item.countLoading));
	return (
		<Link
			to={item.to}
			aria-current={current ? "page" : undefined}
			className={cn(
				"flex min-h-11 items-center gap-2.5 rounded-lg sidebar-item-inset type-body transition-[background-color,color,scale] duration-quick ease-enter active:scale-[0.97]",
				current ? "bg-accent-soft font-semibold text-accent-text" : "text-ink-2 hover:bg-hover hover:text-ink",
			)}
		>
			<Icon name={item.icon} className="size-(--app-nav-icon)" />
			<span className="flex-1">{item.label}</span>
			{skeletonWait1.pending || item.countLoading ? (
				<QuerySkeleton shape="badge" label={<Trans>Loading the total</Trans>} />
			) : item.count ? (
				<CountBadge variant={current ? "solid" : "accent"}>{item.count}</CountBadge>
			) : null}
		</Link>
	);
}

/** Tablets and collapsed desktops share the same destinations, sizes and label tooltips. */
function Rail({ toggle }: { toggle?: (() => void) | undefined }) {
	const { items, settings, trash } = useNavItems();
	const isCurrent = useIsCurrent();

	return (
		<SidebarFrame rail>
			<Link to="/" aria-label="Master CV" className="shell-brand-row w-11 justify-center rounded-md">
				<BrandIcon variant="icon" alt="" className="size-6" />
			</Link>
			{toggle && <SidebarToggle collapsed toggle={toggle} />}
			<nav aria-label={t`App`} className="grid gap-0.5">
				{items.map((item) => (
					<RailNavLink key={item.to} item={item} current={isCurrent(item.to)} />
				))}
			</nav>
			<div className="mt-auto grid justify-items-center gap-2">
				{trash && (
					<RailTip label={trash.label} icon={trash.icon}>
						<Link
							to={trash.to}
							aria-label={t`Trash`}
							className="grid size-11 place-items-center rounded-lg text-ink-2 transition-[background-color,scale] duration-quick ease-enter hover:bg-hover active:scale-[0.97]"
						/>
					</RailTip>
				)}
				<RailNavLink item={settings} current={isCurrent(settings.to)} />
				<UserDropdownMenu>
					{({ session }) => (
						<button
							type="button"
							aria-label={t({ message: "Account", context: "account.settings.accountTab" })}
							className="grid h-16 w-11 place-items-center rounded-lg hover:bg-hover"
						>
							<Avatar size="sidebar">
								<AvatarImage src={session.user.image ?? undefined} />
								<AvatarFallback>{getInitials(session.user.name)}</AvatarFallback>
							</Avatar>
						</button>
					)}
				</UserDropdownMenu>
			</div>
		</SidebarFrame>
	);
}

/** A rail button: its icon inside the given trigger, and its name in a tooltip. */
function RailNavLink({ item, current }: { item: NavItem; current: boolean }) {
	return (
		<RailTip label={item.label} icon={item.icon}>
			<Link
				to={item.to}
				aria-label={item.label}
				aria-current={current ? "page" : undefined}
				className={cn(
					"grid size-11 place-items-center rounded-lg transition-[background-color,color,scale] duration-quick ease-enter active:scale-[0.97]",
					current ? "bg-sunken text-ink" : "text-ink-2 hover:bg-hover",
				)}
			/>
		</RailTip>
	);
}

function RailTip({ label, icon, children }: { label: string; icon: IconName; children: React.ReactElement }) {
	return (
		<Tooltip>
			<TooltipTrigger render={children}>
				<Icon name={icon} className="size-(--app-nav-icon)" />
			</TooltipTrigger>
			<TooltipContent side="inline-end">{label}</TooltipContent>
		</Tooltip>
	);
}

/** Phones keep four navigation destinations; creation stays on the page and in the command palette. */
function MobileTabs() {
	const isCurrent = useIsCurrent();

	const tab = (icon: IconName, label: string, current: boolean) => (
		<>
			<span className="relative flex h-7 w-14 items-center justify-center">
				{current && <MobileTabIndicator pill />}
				<Icon name={icon} size={24} className={cn("relative", current && "text-accent-text")} />
			</span>
			<span className={cn("type-mobile-nav", current ? "font-semibold text-accent-text" : "text-ink-2")}>{label}</span>
		</>
	);

	return (
		<nav
			aria-label={t`App`}
			data-slot="app-bottom-nav"
			className="sticky bottom-0 z-30 grid grid-cols-[repeat(var(--app-mobile-nav-columns),minmax(0,1fr))] border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] [view-transition-name:app-nav]"
		>
			<Link
				to="/dashboard"
				aria-current={isCurrent("/dashboard") ? "page" : undefined}
				viewTransition={false}
				className="relative flex min-h-16 flex-col items-center justify-center gap-0.5 transition-[scale] duration-quick ease-enter active:scale-[0.97]"
			>
				{tab("files", t({ message: "Documents", context: "editor.mobileNav.documents" }), isCurrent("/dashboard"))}
			</Link>
			<Link
				to="/dashboard/career/information"
				aria-current={isCurrent("/dashboard/career/information") ? "page" : undefined}
				viewTransition={false}
				className="relative flex min-h-16 flex-col items-center justify-center gap-0.5 transition-[scale] duration-quick ease-enter active:scale-[0.97]"
			>
				{tab(
					"user",
					t({ message: "Career", context: "editor.mobileNav.career" }),
					isCurrent("/dashboard/career/information"),
				)}
			</Link>
			<Link
				to="/dashboard/applications"
				aria-current={isCurrent("/dashboard/applications") ? "page" : undefined}
				viewTransition={false}
				className="relative flex min-h-16 flex-col items-center justify-center gap-0.5 transition-[scale] duration-quick ease-enter active:scale-[0.97]"
			>
				{tab(
					"briefcase",
					t({ message: "Applications", context: "editor.navigation.applications" }),
					isCurrent("/dashboard/applications"),
				)}
			</Link>
			<Link
				to="/dashboard/settings"
				aria-current={isCurrent("/dashboard/settings") ? "page" : undefined}
				viewTransition={false}
				className="relative flex min-h-16 flex-col items-center justify-center gap-0.5 transition-[scale] duration-quick ease-enter active:scale-[0.97]"
			>
				{tab(
					"gear-six",
					t({ message: "Settings", context: "account.navigation.settings" }),
					isCurrent("/dashboard/settings"),
				)}
			</Link>
		</nav>
	);
}
