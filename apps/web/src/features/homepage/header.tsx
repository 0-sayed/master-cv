import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { Button, buttonVariants } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@reactive-resume/ui/components/sheet";
import { useUiLocale } from "@/features/locale/provider";
import { LocaleSwitch } from "@/features/locale/switch";
import { usePublicCopy } from "@/features/public-copy";

export function LandingHeader() {
	const { locale } = useUiLocale();
	return (
		<>
			<Link
				to="/auth/login"
				search={{ locale, callbackURL: "/dashboard" }}
				className={buttonVariants({ variant: "ghost" })}
			>
				<Trans context="common.navigation.signIn">Sign in</Trans>
			</Link>
			<Link to="/auth/register" search={{ locale, callbackURL: "/dashboard" }} className={buttonVariants()}>
				<Trans context="landing.hero.startFree">Start free</Trans>
			</Link>
		</>
	);
}

const anchors = [
	{ href: "#how-it-works", key: "landing.navigation.howItWorks" },
	{ href: "#pricing", key: "landing.navigation.pricing" },
	{ href: "#privacy", key: "landing.navigation.privacy" },
	{ href: "#faq", key: "landing.navigation.faq" },
] as const;

/** Jumps to the landing's own sections; wide screens only, the page reads top to bottom on phones. */
export function LandingSectionNav() {
	const copy = usePublicCopy();
	return (
		<nav aria-label={copy("landing.navigation.label")} className="flex items-center gap-1">
			{anchors.map(({ href, key }) => (
				<a key={href} href={href} className={buttonVariants({ variant: "quiet" })}>
					{copy(key)}
				</a>
			))}
		</nav>
	);
}

/**
 * The phone header: the primary action stays visible, and everything else (sections, language, sign in) opens in a
 * bottom sheet, so no control has to shrink to fit one row.
 */
export function LandingCompactActions() {
	const copy = usePublicCopy();
	const { locale } = useUiLocale();
	return (
		<>
			<Link to="/auth/register" search={{ locale, callbackURL: "/dashboard" }} className={buttonVariants()}>
				<Trans context="landing.hero.startFree">Start free</Trans>
			</Link>
			<Sheet>
				<SheetTrigger
					render={<Button variant="secondary" size="icon-lg" aria-label={copy("landing.navigation.menu")} />}
				>
					<Icon name="list" size={22} />
				</SheetTrigger>
				<SheetContent side="bottom">
					<SheetHeader>
						<SheetTitle>{copy("landing.navigation.menu")}</SheetTitle>
					</SheetHeader>
					<nav aria-label={copy("landing.navigation.label")} className="grid gap-1 px-4">
						{anchors.map(({ href, key }) => (
							<SheetClose
								key={href}
								render={
									<a
										href={href}
										className={buttonVariants({ variant: "ghost", size: "row", className: "justify-start" })}
									/>
								}
							>
								{copy(key)}
							</SheetClose>
						))}
					</nav>
					<div className="grid gap-3 border-t border-line p-4">
						<LocaleSwitch />
						<Link
							to="/auth/login"
							search={{ locale, callbackURL: "/dashboard" }}
							className={buttonVariants({ variant: "secondary", size: "lg" })}
						>
							<Trans context="common.navigation.signIn">Sign in</Trans>
						</Link>
					</div>
				</SheetContent>
			</Sheet>
		</>
	);
}
