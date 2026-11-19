import type { Section } from "./model";
import { useEffect, useRef, useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { useBreakpoint } from "@reactive-resume/ui/hooks/use-breakpoint";
import { cn } from "@reactive-resume/utils/style";
import { useCareerCopy } from "../copy.generated";

type CareerSectionIndexProps = { sections: Array<{ section: Section; total: number }> };
export function CareerSectionIndex({ sections }: CareerSectionIndexProps) {
	const copy = useCareerCopy();
	const breakpoint = useBreakpoint();
	const desktop = breakpoint === "desktop" || breakpoint === "wide";
	const [current, setCurrent] = useState<Section>("experience");
	const navRef = useRef<HTMLElement>(null);
	const keys = sections.map((item) => item.section).join(",");
	useEffect(() => {
		const root = document.getElementById("main-content");
		const headings = keys.split(",").flatMap((section) => {
			const heading = document.getElementById(`career-heading-${section}`);
			return heading ? [{ section: section as Section, heading }] : [];
		});
		const update = () => {
			const offset = desktop
				? Number.parseFloat(navRef.current ? getComputedStyle(navRef.current).top : "0") || 0
				: Math.max(
						navRef.current?.getBoundingClientRect().height ?? 0,
						Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-toolbar-height")) || 0,
					);
			const edge = (root?.getBoundingClientRect().top ?? 0) + offset + 1;
			const passed = headings.filter(({ heading }) => heading.getBoundingClientRect().top <= edge);
			const active = passed.at(-1) ?? headings[0];
			if (active) setCurrent(active.section);
		};
		const observer = new IntersectionObserver(update, { root, threshold: [0, 1] });
		for (const { heading } of headings) observer.observe(heading);
		root?.addEventListener("scroll", update, { passive: true });
		window.addEventListener("resize", update);
		return () => {
			observer.disconnect();
			root?.removeEventListener("scroll", update);
			window.removeEventListener("resize", update);
		};
	}, [keys, desktop]);
	useEffect(() => {
		if (!desktop)
			navRef.current
				?.querySelector<HTMLElement>('[aria-current="location"]')
				?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
	}, [current, desktop]);
	return (
		<nav
			ref={navRef}
			aria-label={copy("editor.career.sectionNavigation")}
			data-slot="career-section-index"
			className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-line bg-bg pb-2 lg:top-4 lg:w-44 lg:shrink-0 lg:flex-col lg:self-start lg:border-0"
		>
			<p className="hidden px-3 py-2 type-metadata text-ink-2 lg:block">{copy("editor.career.sectionNavigation")}</p>
			{sections.map(({ section, total }) => (
				<Button
					key={section}
					variant="ghost"
					size="row"
					aria-current={current === section ? "location" : undefined}
					className={cn(
						"justify-between gap-3 text-start whitespace-nowrap lg:whitespace-normal",
						current === section && "text-brand bg-surface font-semibold",
					)}
					render={
						<a
							href={`#career-section-${section}`}
							onClick={(event) => {
								event.preventDefault();
								const heading = document.getElementById(`career-heading-${section}`);
								heading?.focus({ preventScroll: true });
								heading?.scrollIntoView({
									block: "start",
									behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
								});
								setCurrent(section);
							}}
						/>
					}
				>
					<span>
						{copy(section === "certifications" ? "editor.certificates.title" : (`editor.${section}.title` as const))}
					</span>
					<span className="type-metadata text-ink-2" dir="ltr">
						{total}
					</span>
				</Button>
			))}
		</nav>
	);
}
