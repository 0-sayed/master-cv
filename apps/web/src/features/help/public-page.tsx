import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@reactive-resume/ui/components/button";
import { HelpPage } from "./page";
import { PublicShell } from "./public-shell";
import { useUiLocale } from "@/features/locale/provider";
import { usePublicSeo } from "@/libs/public-seo";
export function PublicHelp() {
	usePublicSeo("help");
	const { locale } = useUiLocale();
	const title = <Trans context="help.page.title">Help and contact</Trans>;
	return (
		<PublicShell
			title={title}
			headerActions={
				<>
					{/* On phones the logo already leads home, so the header keeps one row. */}
					<Link
						to="/"
						search={{ locale }}
						className={buttonVariants({ variant: "link", size: "link-touch", className: "max-sm:hidden" })}
					>
						<Trans context="privacy.navigation.home">Back to home</Trans>
					</Link>
					<Link to="/auth/login" search={{ locale, callbackURL: "/help" }} className={buttonVariants()}>
						<Trans>Sign in</Trans>
					</Link>
				</>
			}
		>
			<HelpPage user={null} />
		</PublicShell>
	);
}
