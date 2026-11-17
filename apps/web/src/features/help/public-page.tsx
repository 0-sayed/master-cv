import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { BackNavigation } from "@reactive-resume/ui/components/back-navigation";
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
					<BackNavigation className="max-sm:hidden" render={<Link to="/" search={{ locale }} />}>
						<Trans context="privacy.navigation.home">Back to home</Trans>
					</BackNavigation>
					<Link
						to="/auth/login"
						search={{ locale, callbackURL: `/help?locale=${locale}` }}
						className={buttonVariants()}
					>
						<Trans>Sign in</Trans>
					</Link>
				</>
			}
		>
			<HelpPage user={null} />
		</PublicShell>
	);
}
