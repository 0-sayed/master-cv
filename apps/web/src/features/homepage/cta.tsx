import { LandingPrimaryAction } from "./header";
import { usePublicCopy } from "@/features/public-copy";

/** One final invitation follows the complete FAQ and leads into the footer. */
export function ClosingCta() {
	const copy = usePublicCopy();
	return (
		<section aria-labelledby="cta-title" className="border-t border-line bg-accent-soft text-accent-text">
			<div className="landing-container flex flex-col items-start gap-6 py-8 md:flex-row md:items-center md:justify-between md:py-10">
				<h2 id="cta-title" className="type-title-s text-balance md:type-title">
					{copy("landing.cta.title")}
				</h2>
				<div className="shrink-0">
					<LandingPrimaryAction placement="closing" />
				</div>
			</div>
		</section>
	);
}
