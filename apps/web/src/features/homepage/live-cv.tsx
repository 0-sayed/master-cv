import type { ExampleLanguage } from "./example";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@reactive-resume/ui/components/badge";
import { buttonVariants } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { cn } from "@reactive-resume/utils/style";
import { landingExample } from "./example";
import { usePublicCopy } from "@/features/public-copy";

/** 0 file arrives · 1 identity fills · 2 experience fills · 3 suggestion · 4 accepted + job evidence · 5 PDF ready. */
const FINAL = 5;
const STEP_MS = 1600;

/** Steps through the demo while it is on screen; rests on the finished CV under reduced motion and before hydration. */
function useLiveStep(target: React.RefObject<HTMLElement | null>) {
	const [step, setStep] = useState(FINAL);
	useEffect(() => {
		const element = target.current;
		if (
			!element ||
			globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
			typeof IntersectionObserver === "undefined"
		)
			return;
		let visible = true;
		const observer = new IntersectionObserver(([entry]) => {
			visible = Boolean(entry?.isIntersecting);
		});
		observer.observe(element);
		const timer = setInterval(() => {
			if (visible && !document.hidden) setStep((current) => (current + 1) % (FINAL + 1));
		}, STEP_MS);
		return () => {
			clearInterval(timer);
			observer.disconnect();
		};
	}, [target]);
	return step;
}

/** Shows `children` from step `from` (to `until`), crossfading over a placeholder in the same cell. */
function Fill({
	step,
	from,
	children,
	placeholder,
}: {
	step: number;
	from: number;
	children: ReactNode;
	placeholder: string;
}) {
	const shown = step >= from;
	return (
		<span className="grid">
			<span
				aria-hidden="true"
				className={cn(
					"h-3 self-center rounded-full bg-paper-ink/10 transition-opacity duration-emphasized [grid-area:1/1]",
					placeholder,
					shown && "opacity-0",
				)}
			/>
			<span className={cn("transition-opacity duration-emphasized [grid-area:1/1]", !shown && "opacity-0")}>
				{children}
			</span>
		</span>
	);
}

function Pop({ show, className, children }: { show: boolean; className?: string; children: ReactNode }) {
	return (
		<div
			className={cn(
				"transition-[opacity,translate] duration-emphasized ease-enter",
				show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
				className,
			)}
		>
			{children}
		</div>
	);
}

/**
 * The hero's centerpiece: a CV that builds itself in a short loop, following the real flow (import a PDF, the facts
 * fill in, a suggestion is accepted, the CV is checked against a job, the PDF is ready with readable text). Decorative: the same steps
 * are explained in words further down, so assistive technology reads only its label.
 */
export function LiveCv({ language, label }: { language: ExampleLanguage; label: string }) {
	const copy = usePublicCopy();
	const frame = useRef<HTMLDivElement>(null);
	const step = useLiveStep(frame);
	const cv = landingExample[language];
	const accepted = step >= 4;
	return (
		<figure aria-label={label} data-live-cv data-step={step} className="relative mx-auto w-full max-w-xl lg:max-w-none">
			<div ref={frame} aria-hidden="true" className="relative sm:pb-10">
				<div className="overflow-hidden rounded-2xl border border-line bg-raised shadow-e3">
					<div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
						<span className="flex min-w-0 items-center gap-2 type-metadata text-ink-2">
							<Icon name="file-pdf" size={18} className="text-danger-text" />
							<bdi dir="ltr" className="truncate whitespace-nowrap">
								{cv.file}
							</bdi>
						</span>
						<span className="flex flex-1 justify-center gap-1" aria-hidden="true">
							{Array.from({ length: FINAL }, (_, index) => (
								<span key={index} className="h-1 w-6 overflow-hidden rounded-full bg-line">
									<span
										className={cn(
											"block size-full origin-left rounded-full bg-accent transition-[scale] duration-emphasized rtl:origin-right",
											step > index ? "scale-x-100" : "scale-x-0",
										)}
									/>
								</span>
							))}
						</span>
						<Badge variant={step >= 1 ? "accent" : "neutral"}>
							<Icon name={step >= 1 ? "check" : "spinner"} size={12} className={cn(step < 1 && "animate-spin")} />
							{copy("landing.live.imported")}
						</Badge>
					</div>
					<div
						lang={cv.lang}
						dir={cv.dir}
						className="grid min-h-80 gap-x-10 gap-y-6 bg-paper p-6 text-paper-ink sm:grid-cols-[3fr_2fr] sm:p-10"
					>
						<div className="grid content-start gap-4">
							<div className="grid gap-1">
								<p className="type-title">
									<Fill step={step} from={1} placeholder="w-1/2">
										{cv.name}
									</Fill>
								</p>
								<p className="type-section text-paper-accent">
									<Fill step={step} from={1} placeholder="w-1/3">
										{cv.role} · {cv.location}
									</Fill>
								</p>
							</div>
							<div className="grid gap-2">
								<p className="type-metadata font-semibold text-paper-accent">{cv.headings.experience}</p>
								<ul className="grid list-disc gap-2 ps-5 type-body">
									<li>
										<Fill step={step} from={2} placeholder="w-4/5">
											<span
												className={cn(
													"-mx-1.5 rounded-md box-decoration-clone px-1.5 py-0.5",
													(step === 3 || accepted) && "bg-paper-highlight",
												)}
											>
												{accepted ? cv.after : cv.before}
											</span>
										</Fill>
									</li>
									<li>
										<Fill step={step} from={2} placeholder="w-3/4">
											{cv.job.bullets[1]}
										</Fill>
									</li>
								</ul>
							</div>
						</div>
						<div className="grid content-start gap-4">
							<div className="grid gap-1">
								<p className="type-metadata font-semibold text-paper-accent">{cv.headings.education}</p>
								<p className="type-label">
									<Fill step={step} from={2} placeholder="w-full">
										{cv.education.degree}
									</Fill>
								</p>
							</div>
							<div className="grid gap-2">
								<p className="type-metadata font-semibold text-paper-accent">{cv.headings.skills}</p>
								<ul className="flex flex-wrap gap-1.5">
									{cv.skills.slice(0, 3).map((skill) => (
										<li
											key={skill}
											className={cn(
												"rounded-full border border-paper-ink/15 px-2.5 py-0.5 type-metadata transition-opacity duration-emphasized",
												step < 2 && "opacity-0",
											)}
										>
											<bdi>{skill}</bdi>
										</li>
									))}
								</ul>
							</div>
						</div>
					</div>
				</div>
				<Pop show={step === 3} className="absolute end-4 top-24 z-10 w-72 max-w-[85%] sm:end-6">
					<div className="grid gap-2 rounded-xl border border-line bg-raised p-4 shadow-e3">
						<p className="flex items-center gap-2 type-label text-ink">
							<Icon name="sparkle" size={16} className="text-accent-text" />
							{copy("landing.example.after")}
						</p>
						<p lang={cv.lang} dir={cv.dir} className="type-body text-ink">
							{cv.after}
						</p>
						<span className={cn(buttonVariants({ size: "sm" }), "justify-self-start")}>
							<Icon name="check" size={14} />
							{copy("landing.example.accept")}
						</span>
					</div>
				</Pop>
				{/* Status chips: under the card in normal flow on phones (space reserved, so nothing shifts), floating
				    over its lower corners from sm. */}
				<div className="relative z-10 mt-3 flex flex-wrap items-start justify-between gap-2 sm:absolute sm:inset-x-6 sm:bottom-0 sm:mt-0">
					<Pop show={accepted}>
						<span className="flex items-center gap-2 rounded-full border border-line bg-raised px-3 py-2 type-label whitespace-nowrap text-ink shadow-e2">
							<Icon name="check-circle" size={18} className="text-accent-text" />
							{copy("landing.example.found")}
							<span lang={cv.lang} className="text-ink-3 narrow:hidden">
								· {cv.jobs.accountant.title}
							</span>
						</span>
					</Pop>
					<Pop show={step === FINAL} className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
						<span className="flex items-center gap-2 rounded-full border border-line bg-raised px-3 py-2 type-label whitespace-nowrap text-ink shadow-e2">
							<Icon name="text-t" size={18} className="text-accent-text" />
							{copy("landing.live.readable")}
							<Icon name="check" size={16} className="text-accent-text" />
						</span>
						<span className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 type-label whitespace-nowrap text-on-accent shadow-e2">
							<Icon name="download" size={18} />
							{copy("landing.live.pdfReady")}
						</span>
					</Pop>
				</div>
			</div>
		</figure>
	);
}
