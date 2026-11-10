import type { DashboardWidth } from "./dashboard-width";
import type { ReactNode } from "react";
import { cn } from "@reactive-resume/utils/style";

type DashboardPageProps = {
	children: ReactNode;
	/** Phone application workspaces start at their own header, without a shell bar. */
	fullScreenOnMobile?: boolean;
	width?: DashboardWidth;
};

/** Shell controls share the centered dashboard canvas. */
export function DashboardHeader({
	children,
	start,
	search,
	width = "default",
}: {
	children: ReactNode;
	start?: ReactNode;
	search: ReactNode;
	width?: DashboardWidth;
}) {
	return (
		<header
			data-width={width}
			className="shell-toolbar sticky top-0 z-20 border-b border-line bg-surface dashboard-inline [view-transition-name:app-header] dashboard-canvas"
		>
			<div
				data-slot="dashboard-header-content"
				className="dashboard-band dashboard-header-layout h-full w-full items-center"
			>
				<div data-slot="dashboard-header-start" className="min-w-0 max-sm:me-auto">
					{start}
				</div>
				<div data-slot="dashboard-header-search" className="min-w-0">
					{search}
				</div>
				<div data-slot="dashboard-header-controls" className="flex items-center justify-end gap-2">
					{children}
				</div>
			</div>
		</header>
	);
}

/** Center one canvas in the shell; narrower content stays at its inline start. */
export function DashboardPage({ children, fullScreenOnMobile, width = "default" }: DashboardPageProps) {
	return (
		<div
			data-slot="dashboard-page"
			data-width={width}
			className="dashboard-width w-full dashboard-inline type-body [view-transition-name:dashboard-body] dashboard-canvas"
		>
			<div
				data-slot="dashboard-content"
				data-width={width}
				className={cn(
					"dashboard-content grid w-full content-start gap-6 py-8 max-sm:gap-4 max-sm:py-5",
					fullScreenOnMobile && "max-sm:pt-0",
				)}
			>
				{children}
			</div>
		</div>
	);
}

type PageHeaderProps = {
	/** Empty collections put their actions in the empty state, without an idle toolbar. */
	collectionState?: "empty" | "populated";
	title: ReactNode;
	/** One line under the title. */
	description?: ReactNode;
	/** A small back link above the title. */
	back?: ReactNode;
	/** Keep phone-only back navigation from adding empty space on desktop. */
	backOnlyOnMobile?: boolean;
	/** Buttons on the right of the title row. */
	actions?: ReactNode;
	/** The mobile shell already displays this page's title. */
	mobileTitleInShell?: boolean;
	/** The toolbar row under the title: navigation or view tabs first, then search, filters and sort. */
	children?: ReactNode;
};

/** The one header every dashboard page uses. Renders as siblings, so the page's own gap spaces the rows. */
export function PageHeader({
	collectionState,
	title,
	description,
	back,
	backOnlyOnMobile,
	actions,
	children,
	mobileTitleInShell,
}: PageHeaderProps) {
	return (
		<>
			<header className="flex flex-wrap items-center justify-between gap-3">
				<div className={mobileTitleInShell ? "grid min-w-0 gap-1 max-sm:sr-only" : "grid min-w-0 gap-1"}>
					{back && <div className={cn("mb-2", backOnlyOnMobile && "sm:hidden")}>{back}</div>}
					<h1 className="type-title wrap-anywhere">{title}</h1>
					{description && <p className="type-body text-ink-2">{description}</p>}
				</div>
				{collectionState !== "empty" && actions && (
					<div className={mobileTitleInShell ? "flex items-center gap-2 max-sm:w-full" : "flex items-center gap-2"}>
						{actions}
					</div>
				)}
			</header>
			{collectionState !== "empty" && children && (
				<div data-slot="page-toolbar" className="flex flex-wrap items-center gap-3">
					{children}
				</div>
			)}
		</>
	);
}
