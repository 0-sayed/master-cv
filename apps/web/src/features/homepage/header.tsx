import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "@reactive-resume/ui/components/avatar";
import { Button, buttonVariants } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { IconButton } from "@reactive-resume/ui/components/icon-button";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@reactive-resume/ui/components/sheet";
import { getInitials } from "@reactive-resume/utils/string";
import { cn } from "@reactive-resume/utils/style";
import { useUiLocale } from "@/features/locale/provider";
import { LocaleSwitch } from "@/features/locale/switch";
import { usePublicCopy } from "@/features/public-copy";
import { usePublicSession } from "@/features/public-session";
import { ThemeToggleButton } from "@/features/theme/toggle-button";
import { UserDropdownMenu } from "@/features/user/dropdown-menu";

type LandingPrimaryActionProps = { placement: "header" | "closing"; callbackURL?: string; compact?: boolean };

/** Both placements consume the resolved header identity from the existing session cache. */
export function LandingPrimaryAction({
	placement,
	callbackURL = "/dashboard",
	compact = false,
}: LandingPrimaryActionProps) {
	const { locale } = useUiLocale();
	const copy = usePublicCopy();
	const { session, pending } = usePublicSession();
	if (pending) return <span aria-hidden="true" className="inline-block h-11 w-40 rounded-md bg-sunken sm:w-52" />;
	const closing = placement === "closing";
	return (
		<Link
			to={session ? "/dashboard" : "/auth/register"}
			search={session ? { locale } : { locale, callbackURL }}
			className={buttonVariants({ size: closing ? "lg" : compact ? "compact" : "default" })}
		>
			{session ? (
				copy("landing.navigation.workspace")
			) : closing ? (
				copy("landing.hero.cta")
			) : (
				<Trans context="landing.hero.startFree">Start free</Trans>
			)}
			{closing && <Icon name="arrow-right" size={18} />}
		</Link>
	);
}

export function LandingHeader({
	compact = false,
	presentation = "default",
	callbackURL = "/dashboard",
}: {
	compact?: boolean;
	presentation?: "default" | "compact";
	callbackURL?: string;
}) {
	const { locale } = useUiLocale();
	const { session, pending } = usePublicSession();
	if (pending) return <span aria-hidden="true" className="inline-block h-11 w-40 rounded-md bg-sunken sm:w-52" />;
	if (session)
		return (
			<div className="flex items-center gap-2">
				<LandingPrimaryAction placement="header" />
				<UserDropdownMenu>
					{({ session: current }) => (
						<Button
							variant="ghost"
							size="icon"
							className="hidden sm:inline-flex"
							aria-label={t({ message: "Account", context: "account.settings.accountTab" })}
						>
							<Avatar size="sm">
								<AvatarImage src={current.user.image ?? undefined} />
								<AvatarFallback>{getInitials(current.user.name)}</AvatarFallback>
							</Avatar>
						</Button>
					)}
				</UserDropdownMenu>
			</div>
		);
	return (
		<>
			{!compact && presentation === "compact" && (
				<IconButton
					icon="user-circle"
					label={t({ message: "Sign in", context: "common.navigation.signIn" })}
					variant="secondary"
					size="header-icon"
					className="sm:hidden"
					render={<Link to="/auth/login" search={{ locale, callbackURL }} />}
				/>
			)}
			{!compact && (
				<Link
					to="/auth/login"
					search={{ locale, callbackURL }}
					className={cn(
						buttonVariants({ variant: "secondary" }),
						presentation === "compact" && "hidden sm:inline-flex",
					)}
				>
					<Trans context="common.navigation.signIn">Sign in</Trans>
				</Link>
			)}
			<LandingPrimaryAction placement="header" callbackURL={callbackURL} compact={presentation === "compact"} />
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
 * The phone header keeps language and the primary action visible. Sections, theme and sign-in open in a bottom sheet.
 */
export function LandingCompactActions() {
	const copy = usePublicCopy();
	const { locale } = useUiLocale();
	const { session, pending } = usePublicSession();
	return (
		<>
			<LocaleSwitch compact />
			<LandingHeader compact presentation="compact" />
			<Sheet>
				<SheetTrigger
					render={<IconButton icon="list" size="icon-lg" iconSize={22} label={copy("landing.navigation.menu")} />}
				/>
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
						<ThemeToggleButton showLabel size="row" variant="ghost" className="justify-start" />
						{!pending && !session && (
							<Link
								to="/auth/login"
								search={{ locale, callbackURL: "/dashboard" }}
								className={buttonVariants({ variant: "secondary", size: "lg" })}
							>
								<Trans context="common.navigation.signIn">Sign in</Trans>
							</Link>
						)}
					</div>
				</SheetContent>
			</Sheet>
		</>
	);
}
