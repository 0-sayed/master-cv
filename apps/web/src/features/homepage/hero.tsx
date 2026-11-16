import type { ExampleLanguage } from "./example";
import type { CSSProperties } from "react";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { cn } from "@reactive-resume/utils/style";
import { heroFragments } from "./example";
import { LiveCv } from "./live-cv";
import { useUiLocale } from "@/features/locale/provider";
import { usePublicCopy } from "@/features/public-copy";

/** The document language that matches the interface; the other version sits behind it. */
export const exampleLanguageFor = (locale: string): ExampleLanguage => (locale === "ar-SA" ? "ar" : "en");

/**
 * The hero follows the theme: the headline and actions on the start side, a CV that builds itself on the end side,
 * and synthetic CV fragments from common jobs drifting behind.
 */
export function Hero() {
	const copy = usePublicCopy();
	const { locale } = useUiLocale();
	const language = exampleLanguageFor(locale);
	return (
		<section
			aria-labelledby="landing-title"
			data-landing-hero
			className="relative isolate flex landing-first-screen flex-col overflow-hidden border-b border-line bg-bg landing-glow text-ink"
		>
			<HeroBackdrop />
			<div className="relative landing-container my-auto grid items-center gap-16 pt-12 pb-20 sm:pt-16 lg:grid-cols-2 lg:gap-12 lg:py-16">
				<div className="grid content-start justify-items-start gap-6">
					<p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 type-body text-ink-2">
						<Icon name="translate" size={16} className="text-accent-text" />
						{copy("landing.hero.eyebrow")}
					</p>
					<h1 id="landing-title" className="type-hero text-ink">
						<Trans context="landing.hero.display">
							Your CV, as <AccentWord>clear</AccentWord> as your experience.
						</Trans>
					</h1>
					<p className="max-w-xl type-section font-normal text-ink-2">{copy("landing.hero.subtitle")}</p>
					<div className="flex flex-wrap items-center gap-3">
						<Link
							to="/auth/register"
							search={{ locale, callbackURL: "/dashboard" }}
							className={buttonVariants({ size: "lg" })}
						>
							{copy("landing.hero.cta")}
							<Icon name="arrow-right" size={18} />
						</Link>
						<a href="#how-it-works" className={buttonVariants({ variant: "secondary", size: "lg" })}>
							{copy("landing.navigation.howItWorks")}
						</a>
					</div>
					<p className="flex items-center gap-2 type-body text-ink-3">
						<Icon name="shield" size={16} className="text-accent-text" />
						{copy("landing.hero.reassurance")}
					</p>
				</div>
				<LiveCv language={language} label={copy("landing.example.disclosure")} />
			</div>
			<span
				aria-hidden="true"
				className="absolute bottom-6 left-1/2 hidden size-10 -translate-x-1/2 landing-bob place-items-center rounded-full border border-line text-ink-3 lg:grid"
			>
				<Icon name="caret-down" size={18} />
			</span>
		</section>
	);
}

function AccentWord({ children }: { children?: React.ReactNode }) {
	return (
		<span className="relative inline-block text-accent">
			{children}
			<svg
				aria-hidden="true"
				viewBox="0 0 200 16"
				preserveAspectRatio="none"
				className="landing-stroke absolute inset-x-0 -bottom-1 h-3 w-full text-accent"
			>
				<path d="M3 11 C 50 4, 120 3, 197 8" pathLength={1} strokeWidth={4} vectorEffect="non-scaling-stroke" />
			</svg>
		</span>
	);
}

/** Pencil guides and drifting CV fragments; decorative only and static under reduced motion. */
function HeroBackdrop() {
	return (
		<div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
			<span className="landing-guide inset-y-0 start-[8%] w-px opacity-60" />
			<span className="landing-guide inset-y-0 end-[30%] hidden w-px opacity-60 lg:block" style={guideDelay(1)} />
			<span data-axis="x" className="landing-guide inset-x-0 top-[16%] h-px opacity-60" style={guideDelay(2)} />
			<span data-axis="x" className="landing-guide inset-x-0 bottom-[12%] h-px opacity-60" style={guideDelay(3)} />
			{heroFragments.map((fragment) => (
				// The outer box resolves start/end against the page direction; the text keeps its own.
				<span
					key={fragment.text}
					className={cn("landing-fragment", fragment.desktopOnly && "hidden lg:block")}
					style={
						{
							top: fragment.at.top,
							insetInlineStart: fragment.at.start,
							"--fragment-tilt": fragment.at.tilt,
							"--drift": fragment.at.drift,
							"--drift-duration": fragment.at.duration,
							"--drift-delay": fragment.at.delay,
						} as CSSProperties
					}
				>
					<span
						lang={fragment.lang}
						dir="auto"
						className={cn(
							"block",
							fragment.kind === "title" && "type-title-s text-ink-3 opacity-50",
							fragment.kind === "line" && "type-section font-normal text-ink-3 opacity-50",
							fragment.kind === "meta" && "type-metadata text-ink-3 opacity-60",
							fragment.kind === "chip" &&
								"rounded-full border border-accent/30 bg-accent-soft px-3 py-1 type-label text-accent-text opacity-70",
						)}
					>
						{fragment.text}
					</span>
				</span>
			))}
		</div>
	);
}

const guideDelay = (step: number) => ({ "--draw-delay": `${step * 120}ms` }) as CSSProperties;
