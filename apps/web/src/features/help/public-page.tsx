import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { BackNavigation } from "@reactive-resume/ui/components/back-navigation";
import { HelpPage } from "./page";
import { PublicShell } from "./public-shell";
import { LandingHeader } from "@/features/homepage/header";
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
					<LandingHeader callbackURL={`/help?locale=${locale}`} />
				</>
			}
		>
			<HelpPage user={null} />
		</PublicShell>
	);
}
