import { Icon } from "@reactive-resume/ui/components/icon";
import { landingExample } from "./example";
import { exampleLanguageFor } from "./hero";
import { reveal } from "./reveal";
import { DecisionBadge, SectionIntro } from "./section";
import { useUiLocale } from "@/features/locale/provider";
import { usePublicCopy } from "@/features/public-copy";

/** One suggestion as the product shows it: the original, the suggested wording and why, waiting for a decision. */
export function ReviewShowcase() {
	const copy = usePublicCopy();
	const { locale } = useUiLocale();
	const cv = landingExample[exampleLanguageFor(locale)];
	return (
		<section aria-labelledby="review-title" className="border-y border-line bg-surface landing-section">
			<div className="landing-container grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
				<SectionIntro
					titleId="review-title"
					eyebrow={copy("landing.review.eyebrow")}
					title={copy("landing.review.title")}
					body={copy("landing.review.body")}
				/>
				<figure
					{...reveal(1)}
					aria-label={copy("landing.example.disclosure")}
					className="mx-auto w-full max-w-xl overflow-hidden rounded-3xl border border-line bg-raised shadow-e2 lg:max-w-none"
				>
					<div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
						<p className="flex items-center gap-3 type-label text-ink">
							<span className="grid size-8 place-items-center rounded-full bg-accent-soft text-accent-text">
								<Icon name="sparkle" size={18} />
							</span>
							<span className="grid">
								{copy("landing.example.after")}
								<span lang={cv.lang} dir={cv.dir} className="type-metadata text-ink-3">
									{cv.headings.experience} · {cv.job.title}
								</span>
							</span>
						</p>
						<DecisionBadge />
					</div>
					<div lang={cv.lang} dir={cv.dir} className="grid gap-3 p-6">
						<p className="type-metadata text-ink-3">{copy("landing.example.before")}</p>
						<p className="type-section font-normal text-ink-3 line-through decoration-ink-3/60">{cv.before}</p>
						<p className="mt-2 type-metadata text-accent-text">{copy("landing.example.after")}</p>
						<p className="rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 type-section text-ink">
							{cv.after}
						</p>
					</div>
					<div className="grid gap-3 border-t border-line bg-surface px-6 py-4 type-body text-ink-2">
						<p className="flex items-start gap-2">
							<Icon name="lightbulb" size={18} className="mt-1 shrink-0 text-ink-3" />
							{copy("landing.example.reason")}
						</p>
						<p className="flex items-start gap-2">
							<Icon name="question" size={18} className="mt-1 shrink-0 text-accent-text" />
							{copy("landing.example.question")}
						</p>
					</div>
				</figure>
			</div>
		</section>
	);
}
