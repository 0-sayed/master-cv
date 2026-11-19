import type { ReactNode } from "react";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BackNavigation } from "@reactive-resume/ui/components/back-navigation";
import { buttonVariants } from "@reactive-resume/ui/components/button";
import { getProductName } from "@reactive-resume/utils/brand";
import { cn } from "@reactive-resume/utils/style";
import { BrandIcon } from "@/components/ui/brand-icon";
import { useUiLocale } from "@/features/locale/provider";
import { LocaleSwitch } from "@/features/locale/switch";

export type PublicShellProps = {
	title?: ReactNode;
	children: ReactNode;
	focused?: boolean;
	statusPage?: boolean;
	headerActions?: ReactNode;
	/** In-page navigation, shown between the logo and the locale switch on wide screens. */
	navigation?: ReactNode;
	/** Replaces the locale switch and header actions below `lg`: one primary action and a menu, for phones. */
	compactActions?: ReactNode;
	variant?: "content" | "landing";
	footer?: ReactNode;
};
const containers = { content: "mx-auto w-full max-w-5xl px-6 sm:px-8", landing: "landing-container" } as const;
export function PublicShell({
	title,
	children,
	focused = false,
	statusPage = false,
	headerActions,
	navigation,
	compactActions,
	variant = "content",
	footer,
}: PublicShellProps) {
	const { locale } = useUiLocale();
	const container = containers[variant];
	const landing = variant === "landing";
	const scrolled = useScrolled(landing);
	return (
		<div className={cn("flex min-h-svh flex-col bg-bg text-ink", statusPage && "sadu-surface")}>
			<a
				href="#main-content"
				className={cn(
					buttonVariants(),
					"sr-only absolute focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50",
				)}
			>
				<Trans>Skip to main content</Trans>
			</a>
			{/* On wide screens the landing header stays in reach and narrows into a floating bar once the page scrolls. */}
			<header
				data-scrolled={scrolled || undefined}
				className={cn(landing ? "top-0 z-40 landing-header lg:sticky" : "border-b border-line bg-surface")}
			>
				<div className={cn(container, "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-4 sm:gap-x-4")}>
					<Link
						to="/"
						search={{ locale }}
						aria-label={getProductName(locale)}
						className={buttonVariants({ variant: "ghost" })}
					>
						{/* On narrow screens only the mark fits beside the header actions (below 360px on the landing, which
						    moves its actions into a menu; below sm on content pages); the link keeps the full name. */}
						<span className={landing ? "inline-flex narrow:hidden" : "inline-flex max-sm:hidden"}>
							<BrandIcon variant="logo" animateOnce={statusPage || landing} />
						</span>
						<span className={landing ? "hidden narrow:inline-flex" : "hidden max-sm:inline-flex"}>
							<BrandIcon variant="icon" alt="" />
						</span>
					</Link>
					{navigation && <div className="hidden lg:ms-6 lg:flex">{navigation}</div>}
					<div className={cn("ms-auto", compactActions && "hidden lg:block")}>
						<LocaleSwitch />
					</div>
					{headerActions && (
						<nav className={cn("flex flex-wrap items-center justify-end gap-2", compactActions && "hidden lg:flex")}>
							{headerActions}
						</nav>
					)}
					{compactActions && <div className="flex items-center gap-2 lg:hidden">{compactActions}</div>}
				</div>
			</header>
			<main
				id="main-content"
				tabIndex={-1}
				className={cn(
					landing
						? "flex-1 outline-none"
						: [container, "grid flex-1 gap-6 py-8 outline-none", focused ? "content-center" : "content-start"],
				)}
			>
				{title && <h1 className="type-title">{title}</h1>}
				{children}
			</main>
			<footer className={cn("border-t border-line", landing ? "bg-sunken" : "bg-surface")}>
				<div
					className={cn(
						container,
						"flex flex-wrap items-center justify-between gap-4",
						landing ? "pt-10 pb-6" : "py-6",
					)}
				>
					{footer ?? (
						<>
							<BackNavigation render={<Link to="/" search={{ locale }} />}>
								<Trans context="privacy.navigation.home">Back to home</Trans>
							</BackNavigation>
							<Link
								to="/privacy-and-terms"
								search={{ locale, tab: "privacy" }}
								className={buttonVariants({ variant: "link", size: "link-touch" })}
							>
								<Trans context="legal.page.title">Privacy and terms</Trans>
							</Link>
							<Link to="/help" search={{ locale }} className={buttonVariants({ variant: "link", size: "link-touch" })}>
								<Trans context="help.page.title">Help and contact</Trans>
							</Link>
						</>
					)}
				</div>
			</footer>
		</div>
	);
}

/** True once the page has scrolled past the top; drives the landing header's compact state. */
function useScrolled(enabled: boolean) {
	const [scrolled, setScrolled] = useState(false);
	useEffect(() => {
		if (!enabled) return;
		const update = () => setScrolled(window.scrollY > 24);
		update();
		window.addEventListener("scroll", update, { passive: true });
		return () => window.removeEventListener("scroll", update);
	}, [enabled]);
	return scrolled;
}
