import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { reveal } from "./reveal";
import { SectionIntro } from "./section";
import { ATS_GUIDE_ROUTE } from "@/features/ats-guide/links";
import { useUiLocale } from "@/features/locale/provider";
import { usePublicCopy } from "@/features/public-copy";

// Each check mirrors a rule the PDF readability engine really reports (ats-checker/messages.ts): no text layer or
// image-only pages, garbled or broken fonts, password protection, and files over 2.5 MB. It reports findings, never a score.
const checks = [
	{ key: "landing.ats.check.text", icon: "text-t" },
	{ key: "landing.ats.check.fonts", icon: "text-aa" },
	{ key: "landing.ats.check.open", icon: "lock-open" },
	{ key: "landing.ats.check.size", icon: "file-pdf" },
] as const;

/** What "ATS-ready" means here, said plainly: the exported PDF is checked for readable text, with no pass score. */
export function AtsShowcase() {
	const copy = usePublicCopy();
	const { locale } = useUiLocale();
	return (
		<section id="ats" aria-labelledby="ats-title" className="bg-bg landing-section">
			<div className="landing-container grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
				<SectionIntro
					titleId="ats-title"
					eyebrow={copy("landing.ats.eyebrow")}
					title={copy("landing.ats.title")}
					body={copy("landing.ats.body")}
				>
					<p className="flex items-start gap-3 type-body text-ink">
						<Icon name="translate" size={20} className="mt-0.5 shrink-0 text-accent-text" />
						{copy("landing.ats.order")}
					</p>
					<Link
						to={ATS_GUIDE_ROUTE}
						search={{ locale }}
						className={buttonVariants({ variant: "secondary", size: "lg", className: "justify-self-start" })}
					>
						{copy("landing.ats.link")}
						<Icon name="arrow-right" size={18} />
					</Link>
				</SectionIntro>
				<figure
					{...reveal(1)}
					aria-label={copy("landing.example.disclosure")}
					className="mx-auto w-full max-w-xl overflow-hidden rounded-3xl border border-line bg-raised shadow-e2 lg:max-w-none"
				>
					<div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
						<p className="flex items-center gap-3 type-label text-ink">
							<span className="grid size-8 place-items-center rounded-full bg-accent-soft text-accent-text">
								<Icon name="file-pdf" size={18} />
							</span>
							{copy("landing.ats.panel")}
						</p>
						<bdi dir="ltr" className="truncate type-metadata whitespace-nowrap text-ink-3">
							abdullah-cv.pdf
						</bdi>
					</div>
					<ul className="divide-y divide-line">
						{checks.map(({ key, icon }) => (
							<li key={key} className="flex items-center gap-4 px-6 py-4">
								<span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sunken text-ink-2">
									<Icon name={icon} size={18} />
								</span>
								<span className="flex-1 type-section font-normal text-ink">{copy(key)}</span>
								<Icon name="check-circle" size={22} className="shrink-0 text-accent-text" />
							</li>
						))}
					</ul>
					<p className="border-t border-line bg-surface px-6 py-3 type-body text-ink-2">{copy("landing.ats.note")}</p>
				</figure>
			</div>
		</section>
	);
}
