import type { UiLocale } from "@reactive-resume/utils/locale";
import type { ReactNode } from "react";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { BrandIcon } from "@reactive-resume/ui/components/brand-icon";
import { buttonVariants } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { cn } from "@reactive-resume/utils/style";
import { useUiLocale } from "@/features/locale/provider";
import { usePublicCopy } from "@/features/public-copy";

const year = new Date().getFullYear();
// Each language is named in itself, so a visitor can find theirs whatever the current interface language is.
const languages: readonly { locale: UiLocale; name: string }[] = [
	{ locale: "ar-SA", name: "العربية" },
	{ locale: "en-US", name: "English" },
];

/**
 * Brand and tagline, then product, support and legal columns, a language choice and the copyright line.
 * Owner decision 2026-11-15: no visible upstream credit; the MIT LICENSE file stays in the repository.
 */
export function LandingFooter() {
	const { locale } = useUiLocale();
	const copy = usePublicCopy();
	const link = buttonVariants({
		variant: "quiet",
		size: "link-touch",
		className: "-mx-3 justify-start px-3 text-ink-2",
	});
	return (
		<div className="grid w-full gap-10">
			<div className="grid gap-10 md:grid-cols-[2fr_1fr_1fr_1fr]">
				<div className="grid content-start justify-items-start gap-3">
					<BrandIcon variant="logo" />
					<p className="max-w-xs type-body text-ink-2">{copy("landing.footer.tagline")}</p>
				</div>
				<FooterColumn title={copy("landing.footer.product")}>
					<Link to="/" hash="how-it-works" search={{ locale }} className={link}>
						{copy("landing.navigation.howItWorks")}
					</Link>
					<Link to="/" hash="pricing" search={{ locale }} className={link}>
						{copy("landing.navigation.pricing")}
					</Link>
					<Link to="/" hash="faq" search={{ locale }} className={link}>
						{copy("landing.navigation.faq")}
					</Link>
				</FooterColumn>
				<FooterColumn title={copy("landing.footer.support")}>
					<Link to="/help" search={{ locale }} className={link}>
						<Trans context="help.page.title">Help and contact</Trans>
					</Link>
				</FooterColumn>
				<FooterColumn title={copy("landing.footer.legal")}>
					<Link to="/privacy-and-terms" search={{ locale, tab: "privacy" }} className={link}>
						{copy("legal.tab.privacy")}
					</Link>
					<Link to="/privacy-and-terms" search={{ locale, tab: "terms" }} className={link}>
						{copy("legal.tab.terms")}
					</Link>
				</FooterColumn>
			</div>
			<div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
				<p className="type-metadata text-ink-3">
					<bdi dir="ltr">
						<Trans context="landing.footer.copyright">© {year} Master CV</Trans>
					</bdi>
				</p>
				<div className="flex items-center gap-1">
					<Icon name="globe" size={16} className="me-1 text-ink-3" />
					{languages.map((language) => (
						<a
							key={language.locale}
							href={`?locale=${language.locale}`}
							lang={language.locale}
							aria-current={language.locale === locale ? "true" : undefined}
							className={cn(
								buttonVariants({ variant: "quiet", size: "link-compact" }),
								"px-2",
								language.locale === locale && "text-ink",
							)}
						>
							{language.name}
						</a>
					))}
				</div>
			</div>
		</div>
	);
}

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
	return (
		<nav aria-label={title} className="grid content-start justify-items-start gap-2">
			<p className="type-label text-ink">{title}</p>
			{children}
		</nav>
	);
}
