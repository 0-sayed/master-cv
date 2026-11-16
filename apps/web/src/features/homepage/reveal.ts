import type { CSSProperties } from "react";
import { useEffect } from "react";

const armedClass = "landing-reveal-armed";

/**
 * Fades landing blocks in as they scroll into view. Content is visible by default (prerendered HTML, no script,
 * reduced motion); the script arms the effect only for blocks that are still below the fold.
 */
export function useScrollReveal() {
	useEffect(() => {
		if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
		if (typeof IntersectionObserver === "undefined") return;
		const blocks = [...document.querySelectorAll<HTMLElement>("main [data-reveal]")];
		// Anything already on screen stays put, so arming never hides what the visitor is reading.
		for (const block of blocks) if (block.getBoundingClientRect().top < innerHeight) block.dataset.revealed = "";
		const root = document.documentElement;
		root.classList.add(armedClass);
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					(entry.target as HTMLElement).dataset.revealed = "";
					observer.unobserve(entry.target);
				}
			},
			{ rootMargin: "0px 0px -12% 0px" },
		);
		for (const block of blocks) if (!("revealed" in block.dataset)) observer.observe(block);
		return () => {
			observer.disconnect();
			root.classList.remove(armedClass);
		};
	}, []);
}

/** Props for one revealed block; `index` staggers siblings. */
export const reveal = (index = 0) => ({
	"data-reveal": "",
	style: { "--reveal-index": index } as CSSProperties,
});
