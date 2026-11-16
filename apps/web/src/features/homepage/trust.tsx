import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { reveal } from "./reveal";
import { useUiLocale } from "@/features/locale/provider";
import { usePublicCopy } from "@/features/public-copy";

const points = ["review", "private", "export", "delete"] as const;

/** The deep-green privacy band; Sadu stays a 3% texture behind it. */
export function TrustBand() {
	const copy = usePublicCopy();
	const { locale } = useUiLocale();
	return (
		<section
			id="privacy"
			tabIndex={-1}
			aria-labelledby="trust-title"
			className="dark sadu-surface sadu-inverse bg-brand-panel landing-section text-on-brand outline-none"
		>
			<div className="landing-container grid items-start gap-12 lg:grid-cols-2 lg:gap-20">
				<div className="grid max-w-xl content-start justify-items-start gap-4">
					<span className="grid size-12 place-items-center rounded-2xl bg-on-brand/10 text-on-brand">
						<Icon name="shield" size={26} />
					</span>
					<h2 id="trust-title" className="type-title text-balance lg:type-display">
						{copy("landing.trust.title")}
					</h2>
					<p className="type-section font-normal text-on-brand/80">{copy("landing.trust.body")}</p>
					<Link
						to="/privacy-and-terms"
						search={{ locale, tab: "privacy" }}
						className={buttonVariants({ variant: "link", size: "link-touch" })}
					>
						{copy("legal.page.title")}
						<Icon name="arrow-right" size={16} />
					</Link>
				</div>
				<ul className="grid gap-3">
					{points.map((point, index) => (
						<li
							key={point}
							{...reveal(index)}
							className="flex items-center gap-4 rounded-xl border border-on-brand/15 bg-on-brand/5 px-5 py-4 type-section text-on-brand"
						>
							<Icon name="check-circle" size={22} className="shrink-0 text-accent-text" />
							{copy(`landing.trust.${point}`)}
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
