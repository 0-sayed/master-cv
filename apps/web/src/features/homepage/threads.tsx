import type { CSSProperties, RefObject } from "react";
import { useEffect, useState } from "react";
import { cn } from "@reactive-resume/utils/style";

type ThreadTone = "accent" | "warn";
export type ThreadSpec = { from: string; to: string; tone?: ThreadTone };

type Path = { d: string; start: [number, number]; end: [number, number]; tone: ThreadTone };

const strokes: Record<ThreadTone, string> = { accent: "stroke-accent fill-accent", warn: "stroke-warn fill-warn" };

/**
 * Draws curved threads between elements marked `data-thread-from` / `data-thread-to` inside `container`. Ends inside
 * a card or page (`data-thread-edge`) attach at that card's edge, so threads never cross text. Positions are measured
 * after layout and on resize; a new `version` re-anchors and replays the drawing. Decorative only.
 */
export function Threads({
	container,
	threads,
	version,
	className,
}: {
	container: RefObject<HTMLElement | null>;
	threads: readonly ThreadSpec[];
	version: string;
	className?: string;
}) {
	const [paths, setPaths] = useState<Path[]>([]);
	// Callers pass fresh arrays each render; the serialized list is the real dependency.
	const signature = JSON.stringify(threads);
	useEffect(() => {
		const root = container.current;
		if (!root) return;
		const specs = JSON.parse(signature) as ThreadSpec[];
		const measure = () => {
			const box = root.getBoundingClientRect();
			const next: Path[] = [];
			for (const thread of specs) {
				const fromElement = root.querySelector(`[data-thread-from="${thread.from}"]`);
				const toElement = root.querySelector(`[data-thread-to="${thread.to}"]`);
				const from = fromElement?.getBoundingClientRect();
				const to = toElement?.getBoundingClientRect();
				if (!from?.width || !to?.width) continue;
				const fromEdge = fromElement?.closest("[data-thread-edge]")?.getBoundingClientRect() ?? from;
				const toEdge = toElement?.closest("[data-thread-edge]")?.getBoundingClientRect() ?? to;
				const rightward = to.left + to.width / 2 > from.left + from.width / 2;
				const x1 = (rightward ? fromEdge.right : fromEdge.left) - box.left;
				const x2 = (rightward ? toEdge.left : toEdge.right) - box.left;
				const y1 = from.top + from.height / 2 - box.top;
				const y2 = to.top + to.height / 2 - box.top;
				const bend = (x2 - x1) / 2;
				next.push({
					d: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`,
					start: [x1, y1],
					end: [x2, y2],
					tone: thread.tone ?? "accent",
				});
			}
			setPaths(next);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(root);
		for (const element of root.querySelectorAll("[data-thread-from], [data-thread-to]")) observer.observe(element);
		void document.fonts?.ready.then(measure);
		return () => observer.disconnect();
	}, [container, signature, version]);

	return (
		<svg aria-hidden="true" className={cn("landing-thread absolute inset-0 size-full", className)}>
			{paths.map((path, index) => (
				<g
					key={`${version}-${index}`}
					className={strokes[path.tone]}
					style={{ "--thread-index": index } as CSSProperties}
				>
					<path d={path.d} pathLength={1} strokeWidth={2} />
					<circle cx={path.start[0]} cy={path.start[1]} r={4} />
					<circle cx={path.end[0]} cy={path.end[1]} r={4} />
				</g>
			))}
		</svg>
	);
}
