import type { ReactNode } from "react";
import { Trans } from "@lingui/react/macro";
import { BrandIcon } from "@reactive-resume/ui/components/brand-icon";
import { buttonVariants } from "@reactive-resume/ui/components/button";
import { cn } from "@reactive-resume/utils/style";
import { LocaleSwitch } from "@/features/locale/switch";
export function PublicShell({
	title,
	children,
	focused = false,
	statusPage = false,
	headerActions,
}: {
	title?: ReactNode;
	children: ReactNode;
	focused?: boolean;
	statusPage?: boolean;
	headerActions?: ReactNode;
}) {
	return (
		<div className={cn("flex min-h-svh flex-col bg-bg", statusPage && "sadu-surface")}>
			<header className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-surface p-4">
				<a href="/" aria-label="Master CV" className={buttonVariants({ variant: "ghost" })}>
					<BrandIcon variant="logo" animateOnce={statusPage} />
				</a>
				{headerActions && (
					<nav className="order-last flex w-full flex-wrap items-center justify-between gap-2 sm:order-none sm:w-auto sm:gap-4">
						{headerActions}
					</nav>
				)}
				<LocaleSwitch />
			</header>
			<main
				className={
					focused
						? "mx-auto grid w-full flex-1 content-center gap-6 p-4 sm:p-8"
						: "mx-auto grid w-full max-w-5xl flex-1 content-start gap-6 p-6"
				}
			>
				{title && <h1 className="type-title">{title}</h1>}
				{children}
			</main>
			<footer className="flex flex-wrap justify-center gap-4 border-t border-line p-4">
				<a href="/" className={buttonVariants({ variant: "link", size: "link-touch" })}>
					<Trans context="privacy.navigation.home">Back to home</Trans>
				</a>
				<a href="/help" className={buttonVariants({ variant: "link", size: "link-touch" })}>
					<Trans context="help.page.title">Help and contact</Trans>
				</a>
			</footer>
		</div>
	);
}
