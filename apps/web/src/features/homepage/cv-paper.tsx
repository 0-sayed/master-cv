import type { ExampleLanguage, FactId } from "./example";
import type { ReactNode } from "react";
import { cn } from "@reactive-resume/utils/style";
import { landingExample } from "./example";

type CvPaperProps = {
	language: ExampleLanguage;
	/** Lines that carry a soft highlight (the fact a mock is about). */
	highlight?: readonly FactId[];
	/** Leaves out the summary, for tighter mocks. */
	compact?: boolean;
	/** Marks each fact line as the end of a thread (job section only). */
	threadTarget?: boolean;
	className?: string;
};

/** Even padding around a highlighted run of text, kept on every wrapped line. */
const highlighted = "rounded-md bg-paper-highlight px-1.5 py-0.5 -mx-1.5 box-decoration-clone";

/** A white document page with synthetic CV content; paper never inverts with the theme. */
export function CvPaper({ language, highlight = [], compact = false, threadTarget = false, className }: CvPaperProps) {
	const cv = landingExample[language];
	const fact = (id: FactId) => ({ "data-fact": id, ...(threadTarget && { "data-thread-to": id }) });
	const mark = (id: FactId, children: ReactNode) => (
		<span
			{...fact(id)}
			className={cn("transition-[background-color] duration-standard", highlight.includes(id) && highlighted)}
		>
			{children}
		</span>
	);
	return (
		<div
			lang={cv.lang}
			dir={cv.dir}
			className={cn(
				"relative grid content-start gap-5 rounded-lg bg-paper p-6 text-paper-ink shadow-page sm:p-8",
				className,
			)}
		>
			<div className="grid justify-items-start gap-1 border-b border-paper-ink/15 pb-4">
				<p className="type-title-s">{cv.name}</p>
				<p className="type-label text-paper-accent">{mark("role", cv.role)}</p>
				<p className="flex flex-wrap gap-x-3 type-metadata text-paper-ink/70">
					<span>{cv.location}</span>
					<bdi dir="ltr">{cv.email}</bdi>
				</p>
			</div>
			{!compact && (
				<PaperSection title={cv.headings.summary}>
					<p className="type-body text-paper-ink/80">{cv.summary}</p>
				</PaperSection>
			)}
			<PaperSection title={cv.headings.experience}>
				<div className="flex flex-wrap items-baseline justify-between gap-x-3">
					<p className="type-label">{cv.job.title}</p>
					<bdi dir="ltr" className="type-metadata text-paper-ink/60 tabular-nums">
						{cv.job.dates}
					</bdi>
				</div>
				<p className="type-metadata text-paper-ink/70">{cv.job.organization}</p>
				<ul className="grid list-disc gap-1.5 ps-5 type-body text-paper-ink/85">
					<li>{mark("bullet-0", cv.job.bullets[0])}</li>
					<li>{mark("bullet-1", cv.job.bullets[1])}</li>
				</ul>
			</PaperSection>
			<PaperSection title={cv.headings.education}>
				<div className="flex flex-wrap items-baseline justify-between gap-x-3">
					<p className="type-label">{mark("education", cv.education.degree)}</p>
					<bdi dir={cv.dir} className="type-metadata text-paper-ink/60 tabular-nums">
						{cv.education.dates}
					</bdi>
				</div>
			</PaperSection>
			<PaperSection title={cv.headings.skills}>
				<ul
					{...fact("skills")}
					className={cn(
						"-m-1 flex flex-wrap gap-1.5 justify-self-start rounded-lg p-1 transition-[background-color] duration-standard",
						highlight.includes("skills") && "bg-paper-highlight",
					)}
				>
					{cv.skills.map((skill) => (
						<li
							key={skill}
							className="rounded-full border border-paper-ink/15 bg-paper px-2.5 py-0.5 type-metadata text-paper-ink/80"
						>
							<bdi>{skill}</bdi>
						</li>
					))}
				</ul>
			</PaperSection>
		</div>
	);
}

function PaperSection({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="grid gap-2">
			<p className="flex items-center gap-2 type-metadata font-semibold text-paper-accent">
				{title}
				<span aria-hidden="true" className="h-px flex-1 bg-paper-ink/10" />
			</p>
			{children}
		</div>
	);
}
