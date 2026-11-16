import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { BrandIcon } from "@reactive-resume/ui/components/brand-icon";
import { buttonVariants } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { reveal } from "./reveal";
import { useUiLocale } from "@/features/locale/provider";
import { usePublicCopy } from "@/features/public-copy";

/** The closing invitation returns to the hero's dark desk, with a slow orbiting light behind it. */
export function ClosingCta() {
	const copy = usePublicCopy();
	const { locale } = useUiLocale();
	return (
		<section aria-labelledby="cta-title" className="dark landing-aurora border-b border-line bg-bg text-ink">
			<div className="landing-container grid justify-items-center gap-6 landing-section text-center">
				<div {...reveal(0)}>
					<BrandIcon variant="icon" alt="" className="size-14" />
				</div>
				<h2 {...reveal(1)} id="cta-title" className="max-w-3xl type-title text-balance lg:type-display">
					{copy("landing.cta.title")}
				</h2>
				<p {...reveal(2)} className="max-w-xl type-section font-normal text-ink-2">
					{copy("landing.cta.body")}
				</p>
				<div {...reveal(3)} className="flex flex-wrap items-center justify-center gap-3">
					<Link
						to="/auth/register"
						search={{ locale, callbackURL: "/dashboard" }}
						className={buttonVariants({ size: "lg" })}
					>
						{copy("landing.hero.cta")}
						<Icon name="arrow-right" size={18} />
					</Link>
					<Link
						to="/auth/login"
						search={{ locale, callbackURL: "/dashboard" }}
						className={buttonVariants({ variant: "secondary", size: "lg" })}
					>
						<Trans context="common.navigation.signIn">Sign in</Trans>
					</Link>
				</div>
			</div>
		</section>
	);
}
