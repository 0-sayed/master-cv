import type { CSSProperties, ReactNode } from "react";
import { Icon } from "@reactive-resume/ui/components/icon";
import { landingExample } from "./example";
import { exampleLanguageFor } from "./hero";
import { reveal } from "./reveal";
import { SectionIntro } from "./section";
import { useUiLocale } from "@/features/locale/provider";
import { usePublicCopy } from "@/features/public-copy";

const steps = [
	{ key: "add", art: UploadArt },
	{ key: "review", art: ReviewArt },
	{ key: "download", art: PdfArt },
] as const;

/** A three-scene product tour: each step shows its own small piece of the product, in reading order. */
export function Steps() {
	const copy = usePublicCopy();
	return (
		<section
			id="how-it-works"
			tabIndex={-1}
			aria-labelledby="steps-title"
			className="border-y border-line bg-surface landing-section outline-none"
		>
			<div className="landing-container grid gap-12 lg:gap-16">
				<SectionIntro
					titleId="steps-title"
					title={copy("landing.steps.title")}
					body={copy("landing.steps.subtitle")}
					align="center"
				/>
				<ol className="grid gap-6 md:grid-cols-3">
					{steps.map(({ key, art: Art }, index) => (
						<li
							key={key}
							{...reveal(index)}
							className="grid content-start overflow-hidden rounded-3xl border border-line bg-raised shadow-e1 transition-[border-color,box-shadow] duration-standard hover:border-line-2 hover:shadow-e2"
						>
							<div aria-hidden="true" className="grid h-44 place-items-center bg-sunken/60 px-6">
								<Art />
							</div>
							<div className="grid gap-1 p-6">
								<span aria-hidden="true" className="type-display text-accent tabular-nums">
									{String(index + 1).padStart(2, "0")}
								</span>
								<h3 className="type-title-s text-ink">{copy(`landing.steps.${key}.title`)}</h3>
								<p className="type-section font-normal text-ink-2">{copy(`landing.steps.${key}.body`)}</p>
							</div>
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}

const pop = (index: number) => ({ "--pop-index": index }) as CSSProperties;

function ArtFrame({ children }: { children: ReactNode }) {
	return <div className="grid w-full max-w-xs justify-items-center gap-3">{children}</div>;
}

/** A drop zone receiving a PDF, with an import bar that fills once the step is on screen. */
function UploadArt() {
	return (
		<ArtFrame>
			<div className="grid w-full justify-items-center gap-3 rounded-xl border-2 border-dashed border-line-2 bg-surface/70 px-4 py-5">
				<Icon name="upload" size={26} className="landing-bob text-accent-text" />
				<div
					className="flex landing-pop items-center gap-2 rounded-lg border border-line bg-raised px-3 py-1.5 shadow-e2"
					style={pop(0)}
				>
					<Icon name="file-pdf" size={18} className="text-danger-text" />
					<bdi dir="ltr" className="truncate type-metadata whitespace-nowrap text-ink">
						abdullah-cv.pdf
					</bdi>
				</div>
				<div className="h-1.5 w-3/4 overflow-hidden rounded-full bg-line">
					<span className="block size-full landing-progress rounded-full bg-accent" />
				</div>
			</div>
		</ArtFrame>
	);
}

/** One line of Abdullah's CV with its suggested wording, accepted with a tick. */
function ReviewArt() {
	const { locale } = useUiLocale();
	const cv = landingExample[exampleLanguageFor(locale)];
	return (
		<ArtFrame>
			<div lang={cv.lang} dir={cv.dir} className="grid w-full gap-2">
				<p className="rounded-lg border border-line bg-surface px-3 py-2 type-body text-ink-3 line-through">
					{cv.before}
				</p>
				<p className="flex items-center justify-between gap-2 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 type-body text-ink">
					{cv.after}
					<span
						className="grid size-6 shrink-0 landing-pop place-items-center rounded-full bg-accent text-on-accent"
						style={pop(2)}
					>
						<Icon name="check" size={14} />
					</span>
				</p>
			</div>
		</ArtFrame>
	);
}

/** A finished page with a download badge. */
function PdfArt() {
	return (
		<ArtFrame>
			<div className="relative">
				<div className="grid aspect-page w-28 -rotate-3 content-start gap-1.5 rounded-sm bg-paper p-3 shadow-page">
					<span className="h-2 w-3/5 rounded-full bg-paper-ink/70" />
					<span className="h-1.5 w-2/5 rounded-full bg-paper-accent" />
					<span className="mt-1 h-px w-full bg-paper-ink/15" />
					{["w-full", "w-11/12", "w-4/5", "w-full", "w-3/4", "w-5/6", "w-2/3"].map((width, index) => (
						<span key={index} className={`h-1 rounded-full bg-paper-ink/15 ${width}`} />
					))}
				</div>
				<span className="absolute -end-4 -bottom-3 grid size-11 landing-bob place-items-center rounded-full bg-accent text-on-accent shadow-e2">
					<Icon name="download" size={20} />
				</span>
				<span
					className="absolute -start-5 -top-3 grid size-9 landing-pop place-items-center rounded-lg bg-danger-soft text-danger-text shadow-e1"
					style={pop(1)}
				>
					<Icon name="file-pdf" size={18} />
				</span>
			</div>
		</ArtFrame>
	);
}
