import { AtsShowcase } from "./ats";
import { ClosingCta } from "./cta";
import { FreeFaq } from "./faq";
import { LandingFooter } from "./footer";
import { LandingCompactActions, LandingHeader, LandingSectionNav } from "./header";
import { Hero } from "./hero";
import { LanguagesShowcase } from "./languages";
import { Pricing } from "./pricing";
import { useScrollReveal } from "./reveal";
import { ReviewShowcase } from "./review";
import { Steps } from "./sections";
import { TailorShowcase } from "./tailor";
import { TrustBand } from "./trust";
import { PublicShell } from "@/features/help/public-shell";
import { ThemeToggleButton } from "@/features/theme/toggle-button";
import { usePublicSeo } from "@/libs/public-seo";

export function Homepage() {
	usePublicSeo("home");
	useScrollReveal();
	return (
		<PublicShell
			variant="landing"
			navigation={<LandingSectionNav />}
			compactActions={<LandingCompactActions />}
			headerActions={
				<>
					<ThemeToggleButton size="header-icon" />
					<LandingHeader />
				</>
			}
			footer={<LandingFooter />}
		>
			<Hero />
			<Steps />
			<AtsShowcase />
			<ReviewShowcase />
			<TailorShowcase />
			<LanguagesShowcase />
			<Pricing />
			<TrustBand />
			<FreeFaq />
			<ClosingCta />
		</PublicShell>
	);
}
