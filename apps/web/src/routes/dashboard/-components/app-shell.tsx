import type { IconName } from "@reactive-resume/ui/components/icon";
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useQuery } from "@tanstack/react-query";
import { Link, useMatchRoute, useRouteContext, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@reactive-resume/ui/components/avatar";
import { SidebarCountBadge } from "@reactive-resume/ui/components/badge";
import { BrandIcon } from "@reactive-resume/ui/components/brand-icon";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { IconButton } from "@reactive-resume/ui/components/icon-button";
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
	const { t } = useLingui();
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
	const trash: NavItem = {
		to: "/dashboard/trash",
		icon: "trash",
		label: t`Trash`,
		...(counts?.trash ? { count: counts.trash } : {}),
	};

	return { items, trash };
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
	const { t } = useLingui();
	const copy = useDocumentsCopy();
	const careerCopy = useCareerCopy();
	const breakpoint = useBreakpoint();
	const { session } = useRouteContext({ from: "__root__" });
	if (!session) throw new Error("AppShell requires an authenticated session");
	const { collapsed, toggle } = useSidebarPreference(session.user.id);
	const desktop = breakpoint === "desktop" || breakpoint === "wide";
	const rail = breakpoint === "tablet" || (desktop && collapsed);
	const openDialog = useDialogStore((state) => state.openDialog);
	const matchRoute = useMatchRoute();
	const welcome = Boolean(matchRoute({ to: "/dashboard/welcome" }));
	const careerInformation = Boolean(matchRoute({ to: "/dashboard/career/information" }));
	// Select the destination width before its outlet mounts, including the Settings index redirect.
	const pageWidth = useRouterState({
		select: (state) => (state.location.pathname === "/help" ? "wide" : dashboardWidth(state.location.pathname)),
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
	useHotkey("Mod+B", () => {
		if (!desktop || isEditableElementFocused() || useDialogStore.getState().open) return;
		toggle();
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
				"dashboard-shell grid h-svh min-h-0 overflow-hidden bg-bg",
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
			<div className="flex min-h-0 min-w-0 flex-col">
				{!mobileWorkspace && (
					<DashboardHeader
						width={pageWidth}
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
				<main
					id="main-content"
					tabIndex={-1}
					className="min-h-0 min-w-0 flex-1 [scrollbar-gutter:stable_both-edges] overflow-y-auto max-lg:[scrollbar-width:none]"
				>
					<GuestBanner />
					<DashboardPage width={pageWidth} fullScreenOnMobile={mobileWorkspace}>
						{children}
					</DashboardPage>
				</main>
			</div>
			{tabs && <MobileTabs />}
		</div>
	);
}

function SidebarToggle({ collapsed, toggle }: { collapsed: boolean; toggle: () => void }) {
	const { t } = useLingui();
	const label = collapsed ? t`Expand sidebar` : t`Collapse sidebar`;
	return (
		<IconButton
			data-slot="sidebar-toggle"
			icon={collapsed ? "sidebar-simple" : "sidebar"}
			label={label}
			shortcut="Mod+B"
			size="icon-lg"
			variant="quiet"
			aria-expanded={!collapsed}
			onClick={toggle}
		/>
	);
}

/** Expanded and rail navigation share every vertical dimension, including the account row. */
function SidebarFrame({ rail = false, children }: { rail?: boolean; children: ReactNode }) {
	const { t } = useLingui();
	return (
		<aside
			aria-label={t`App navigation`}
			className={cn(
				"sticky top-0 z-30 flex h-svh flex-col gap-1 border-e border-line bg-surface pb-3 [view-transition-name:app-nav]",
				rail ? "items-center" : "px-(--app-sidebar-inset)",
			)}
		>
			{children}
		</aside>
	);
}

function NewCvAction({ rail = false }: { rail?: boolean }) {
	const { t } = useLingui();
	const openDialog = useDialogStore((state) => state.openDialog);
	const label = t({ message: "New CV", context: "editor.navigation.newCv" });
	const button = (
		<Button
			size={rail ? "icon-lg" : "toolbar"}
			aria-label={label}
			className={rail ? undefined : "w-full"}
			onClick={() => openDialog("document.new", undefined)}
		>
			<Icon name="plus" />
			{!rail && label}
		</Button>
	);
	return rail ? (
		<Tooltip>
			<TooltipTrigger render={button} />
			<TooltipContent side="inline-end">{label}</TooltipContent>
		</Tooltip>
	) : (
		button
	);
}

function AccountButton({ rail = false, mobile = false }: { rail?: boolean; mobile?: boolean }) {
	const { t } = useLingui();
	const isCurrent = useIsCurrent();
	const help = useMatchRoute()({ to: "/help" });
	const current = isCurrent("/dashboard/settings") || Boolean(help);
	const account = t({ message: "Account", context: "account.settings.accountTab" });
	return (
		<UserDropdownMenu>
			{({ session }) => (
				<Button
					data-slot="sidebar-account"
					variant="ghost"
					size={mobile ? "mobile-nav" : rail ? "sidebar-account-icon" : "sidebar-account"}
					aria-label={rail || mobile ? account : undefined}
					aria-current={current ? "page" : undefined}
					className={cn("text-start", !rail && "w-full justify-start", current && "bg-accent-soft text-accent-text")}
				>
					<Avatar size={mobile ? "sm" : "sidebar"}>
						<AvatarImage src={session.user.image ?? undefined} />
						<AvatarFallback>{getInitials(session.user.name)}</AvatarFallback>
					</Avatar>
					{!rail &&
						(mobile ? (
							<span className="mobile-nav-label">{account}</span>
						) : (
							<span className="grid min-w-0 flex-1">
								<bdi className="truncate type-body font-medium">{session.user.name}</bdi>
								<bdi dir="ltr" className="truncate type-metadata text-ink-2">
									{session.user.email || session.user.username}
								</bdi>
							</span>
						))}
					{!rail && !mobile && <Icon name="caret-down" />}
				</Button>
			)}
		</UserDropdownMenu>
	);
}

function Sidebar({ toggle }: { toggle: () => void }) {
	const { t } = useLingui();
	const { items, trash } = useNavItems();
	const isCurrent = useIsCurrent();
	return (
		<SidebarFrame>
			<div className="shell-brand-row justify-between gap-2">
				<Link to="/" className="flex min-w-0 items-center">
					<BrandIcon variant="logo" />
				</Link>
				<SidebarToggle collapsed={false} toggle={toggle} />
			</div>
			<div className="py-3">
				<NewCvAction />
			</div>
			<nav aria-label={t`App`} className="grid gap-0.5">
				{items.map((item) => (
					<NavLink key={item.to} item={item} current={isCurrent(item.to)} />
				))}
				<div className="my-2 border-t border-line" />
				<NavLink item={trash} current={isCurrent(trash.to)} />
			</nav>
			<div className="mt-auto border-t border-line pt-3">
				<AccountButton />
			</div>
		</SidebarFrame>
	);
}

function NavLink({ item, current, rail = false }: { item: NavItem; current: boolean; rail?: boolean }) {
	const { t } = useLingui();
	const loading = useSkeletonLoading(Boolean(item.countLoading));
	const count = item.count ?? 0;
	const label = item.label;
	const total = String(count);
	const accessibleName =
		count > 0 && !item.countLoading
			? t`${label}, ${plural(count, { one: `${total} item`, other: `${total} items` })}`
			: label;
	const link = (
		<Link
			to={item.to}
			aria-label={accessibleName}
			aria-current={current ? "page" : undefined}
			className={cn(
				"flex min-h-11 items-center rounded-lg transition-[background-color,color,scale] duration-quick ease-enter",
				rail ? "relative size-11 justify-center" : "gap-2.5 sidebar-item-inset type-body active:scale-[0.97]",
				current ? "bg-accent-soft font-semibold text-accent-text" : "text-ink-2 hover:bg-hover hover:text-ink",
			)}
		>
			<Icon name={item.icon} className="size-(--app-nav-icon)" />
			{!rail && <span className="flex-1">{label}</span>}
			{loading.pending || item.countLoading ? (
				!rail && <QuerySkeleton shape="badge" label={<Trans>Loading the total</Trans>} />
			) : (
				<SidebarCountBadge count={count} current={current} rail={rail} />
			)}
		</Link>
	);
	return rail ? (
		<Tooltip>
			<TooltipTrigger render={link} />
			<TooltipContent side="inline-end">{accessibleName}</TooltipContent>
		</Tooltip>
	) : (
		link
	);
}

/** Tablets and collapsed desktops share the same destinations, sizes and label tooltips. */
function Rail({ toggle }: { toggle?: (() => void) | undefined }) {
	const { t } = useLingui();
	const { items, trash } = useNavItems();
	const isCurrent = useIsCurrent();
	return (
		<SidebarFrame rail>
			<div className="relative shell-brand-row w-full justify-center">
				<Link to="/" aria-label="Master CV" className="grid size-11 place-items-center">
					<BrandIcon variant="icon" alt="" className="size-6" />
				</Link>
				{toggle && (
					<div className="absolute inset-y-0 inset-s-full z-30 ms-2 flex items-center">
						<SidebarToggle collapsed toggle={toggle} />
					</div>
				)}
			</div>
			<div className="py-3">
				<NewCvAction rail />
			</div>
			<nav aria-label={t`App`} className="grid gap-0.5">
				{items.map((item) => (
					<NavLink rail key={item.to} item={item} current={isCurrent(item.to)} />
				))}
				<div className="my-2 border-t border-line" />
				<NavLink rail item={trash} current={isCurrent(trash.to)} />
			</nav>
			<div className="mt-auto border-t border-line pt-3">
				<AccountButton rail />
			</div>
		</SidebarFrame>
	);
}

/** Phones keep the bottom-tab pattern, including Trash and the shared account menu. */
function MobileTabs() {
	const { t } = useLingui();
	const ref = useRef<HTMLElement>(null);
	useEffect(() => {
		const nav = ref.current;
		if (!nav) return;
		const update = () =>
			document.documentElement.style.setProperty("--app-bottom-inset", `${nav.getBoundingClientRect().height}px`);
		update();
		const observer = new ResizeObserver(update);
		observer.observe(nav);
		return () => {
			observer.disconnect();
			document.documentElement.style.removeProperty("--app-bottom-inset");
		};
	}, []);
	const isCurrent = useIsCurrent();

	const tab = (icon: IconName, label: string, current: boolean) => (
		<>
			<span className="relative flex h-7 w-14 items-center justify-center">
				{current && <MobileTabIndicator pill />}
				<Icon name={icon} size={24} className={cn("relative", current && "text-accent-text")} />
			</span>
			<span
				className={cn("mobile-nav-label type-mobile-nav", current ? "font-semibold text-accent-text" : "text-ink-2")}
			>
				{label}
			</span>
		</>
	);

	return (
		<nav
			aria-label={t`App`}
			ref={ref}
			data-slot="app-bottom-nav"
			className="sticky bottom-0 z-30 grid grid-cols-[repeat(var(--app-mobile-nav-columns),minmax(0,1fr))] border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] [view-transition-name:app-nav]"
		>
			<Link
				to="/dashboard"
				aria-current={isCurrent("/dashboard") ? "page" : undefined}
				viewTransition={false}
				className="relative flex min-h-16 flex-col items-center justify-start gap-0.5 py-2 transition-[scale] duration-quick ease-enter active:scale-[0.97]"
			>
				{tab("files", t({ message: "Documents", context: "editor.mobileNav.documents" }), isCurrent("/dashboard"))}
			</Link>
			<Link
				to="/dashboard/career/information"
				aria-current={isCurrent("/dashboard/career/information") ? "page" : undefined}
				viewTransition={false}
				className="relative flex min-h-16 flex-col items-center justify-start gap-0.5 py-2 transition-[scale] duration-quick ease-enter active:scale-[0.97]"
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
				className="relative flex min-h-16 flex-col items-center justify-start gap-0.5 py-2 transition-[scale] duration-quick ease-enter active:scale-[0.97]"
			>
				{tab(
					"briefcase",
					t({ message: "Applications", context: "editor.navigation.applications" }),
					isCurrent("/dashboard/applications"),
				)}
			</Link>
			<Link
				to="/dashboard/trash"
				aria-current={isCurrent("/dashboard/trash") ? "page" : undefined}
				viewTransition={false}
				className="relative flex min-h-16 flex-col items-center justify-start gap-0.5 py-2"
			>
				{tab("trash", t`Trash`, isCurrent("/dashboard/trash"))}
			</Link>
			<AccountButton mobile />
		</nav>
	);
}
