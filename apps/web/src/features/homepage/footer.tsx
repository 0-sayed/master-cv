import type { ReactNode } from "react";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@reactive-resume/ui/components/button";
import { BrandIcon } from "@/components/ui/brand-icon";
import { useUiLocale } from "@/features/locale/provider";
import { LocaleSwitch } from "@/features/locale/switch";
import { usePublicCopy } from "@/features/public-copy";

const year = new Date().getFullYear();

/** PublicShell owns the landmark, surface and outer container. */
export function LandingFooter() {
	const { locale } = useUiLocale();
	const copy = usePublicCopy();
	const link = buttonVariants({ variant: "link", size: "link-touch", className: "justify-start text-ink-2" });
	return (
		<div className="grid w-full gap-8">
			<div className="grid grid-cols-2 gap-8 md:grid-cols-[2fr_1fr_1fr]">
				<div className="col-span-2 grid content-start justify-items-start gap-3 md:col-span-1">
					<Link to="/" search={{ locale }} className={buttonVariants({ variant: "ghost", size: "link-touch" })}>
						<BrandIcon variant="logo" />
					</Link>
					<p className="max-w-xs type-body text-ink-2">{copy("landing.footer.tagline")}</p>
				</div>
				<FooterColumn title={copy("landing.footer.product")}>
					<Link to="/" hash="how-it-works" search={{ locale }} className={link}>
						{copy("landing.navigation.howItWorks")}
					</Link>
					<Link to="/" hash="pricing" search={{ locale }} className={link}>
						{copy("landing.navigation.pricing")}
					</Link>
				</FooterColumn>
				<FooterColumn title={copy("landing.footer.support")}>
					<Link to="/" hash="faq" search={{ locale }} className={link}>
						{copy("landing.navigation.faq")}
					</Link>
					<Link to="/help" search={{ locale }} className={link}>
						<Trans context="help.page.title">Help and contact</Trans>
					</Link>
				</FooterColumn>
			</div>
			<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-4 border-t border-line pt-4 md:grid-cols-[1fr_auto_1fr]">
				<nav
					aria-label={copy("landing.footer.legal")}
					className="col-span-2 flex flex-wrap gap-3 md:col-span-1 md:col-start-2 md:row-start-1"
				>
					<Link to="/privacy-and-terms" search={{ locale, tab: "privacy" }} className={link}>
						{copy("legal.tab.privacy")}
					</Link>
					<Link to="/privacy-and-terms" search={{ locale, tab: "terms" }} className={link}>
						{copy("legal.tab.terms")}
					</Link>
				</nav>
				<div className="min-w-0 md:col-start-3 md:row-start-1 md:justify-self-end">
					<LocaleSwitch presentation="choices" />
				</div>
				<p className="justify-self-end type-metadata text-ink-3 md:col-start-1 md:row-start-1 md:justify-self-start">
					<bdi dir="ltr">
						<Trans context="landing.footer.copyright">© {year} Sirawise</Trans>
					</bdi>
				</p>
			</div>
		</div>
	);
}

type FooterColumnProps = { title: string; children: ReactNode };
function FooterColumn({ title, children }: FooterColumnProps) {
	return (
		<nav aria-label={title} className="grid content-start justify-items-start gap-2">
			<p className="type-label text-ink">{title}</p>
			{children}
		</nav>
	);
}
