import type { ExampleLanguage } from "./example";
import { useState } from "react";
import { SegmentedControl, SegmentedControlItem } from "@reactive-resume/ui/components/segmented-control";
import { CvPaper } from "./cv-paper";
import { reveal } from "./reveal";
import { SectionIntro } from "./section";
import { usePublicCopy } from "@/features/public-copy";

/** One set of facts, two document languages: the visitor flips the same CV between Arabic and English. */
export function LanguagesShowcase() {
	const copy = usePublicCopy();
	// Arabic first, whatever the interface language.
	const [language, setLanguage] = useState<ExampleLanguage>("ar");
	return (
		<section aria-labelledby="languages-title" className="border-y border-line bg-surface landing-section">
			<div className="landing-container grid items-center gap-10 lg:grid-cols-2 lg:gap-20">
				<SectionIntro
					titleId="languages-title"
					eyebrow={copy("landing.languages.eyebrow")}
					title={copy("landing.languages.title")}
					body={copy("landing.languages.body")}
				>
					<SegmentedControl
						size="toolbar"
						variant="accent"
						aria-label={copy("landing.example.language")}
						value={language}
						onValueChange={(value) => setLanguage(value as ExampleLanguage)}
						className="justify-self-start"
					>
						<SegmentedControlItem value="ar">{copy("landing.example.arabic")}</SegmentedControlItem>
						<SegmentedControlItem value="en">{copy("landing.example.english")}</SegmentedControlItem>
					</SegmentedControl>
				</SectionIntro>
				<figure
					{...reveal(1)}
					aria-label={copy("landing.example.disclosure")}
					data-example-language={language}
					className="mx-auto w-full max-w-xl lg:max-w-none"
				>
					<CvPaper
						key={language}
						language={language}
						compact
						highlight={["role", "bullet-0", "education"]}
						className="landing-rise"
					/>
				</figure>
			</div>
		</section>
	);
}
