import type { ReactNode } from "react";
import { Fragment, useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "./button";
import { Icon } from "./icon";
import { diffWords, shouldStackDiff } from "./word-diff";
import "./rule-comparison.css";

type SuggestionDiffProps = {
	before: string;
	after: string;
	labels: { before: string; after: string; showMore: string; showLess: string };
	/** Atomic formatted values keep colors and technical tokens intact. */
	values?: { before: ReactNode; after: ReactNode } | undefined;
	layout?: "auto" | "inline";
};

/** One comparison for guide examples and editor findings, with complete spoken values. */
export function SuggestionDiff({ before, after, labels, values, layout = "auto" }: SuggestionDiffProps) {
	const id = useId();
	const ref = useRef<HTMLParagraphElement>(null);
	const [expandedValue, setExpandedValue] = useState<{ before: string; after: string } | null>(null);
	const expanded = expandedValue?.before === before && expandedValue.after === after;
	const [overflow, setOverflow] = useState(false);
	const parts = diffWords(before, after);
	const stacked = layout !== "inline" && !values && shouldStackDiff(before, after);
	const visibleParts =
		stacked || values
			? [
					{ type: "removed" as const, value: before },
					{ type: "added" as const, value: after },
				]
			: parts;

	useLayoutEffect(() => {
		const element = ref.current;
		if (!element) return;
		const measure = () => {
			if (expanded) return;
			const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
			// Arabic glyphs can extend beyond their line box without adding another line.
			setOverflow(element.scrollHeight > element.clientHeight + 1 && Math.round(element.scrollHeight / lineHeight) > 3);
		};
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		measure();
		return () => observer.disconnect();
	}, [expanded, before, after]);

	return (
		<div data-slot="rule-comparison" className="grid min-w-0 gap-1">
			<p className="sr-only">
				{labels.before}: <bdi dir="auto">{before}</bdi>. {labels.after}: <bdi dir="auto">{after}</bdi>.
			</p>
			<p
				ref={ref}
				id={id}
				aria-hidden="true"
				data-expanded={expanded}
				data-layout={stacked ? "stacked" : "inline"}
				className="rule-comparison-value type-body text-ink"
			>
				{visibleParts.map((part, index) => (
					<Fragment key={`${index}-${part.type}`}>
						{index > 0 && visibleParts[index - 1]?.type === "removed" && part.type === "added" && !stacked && " "}
						{part.type === "equal" ? (
							<bdi dir="auto">{part.value}</bdi>
						) : part.type === "removed" ? (
							<del className="bg-danger-soft text-danger-text">
								{values ? values.before : <bdi dir="auto">{part.value}</bdi>}
							</del>
						) : (
							<ins className="bg-accent-soft text-accent-text">
								{stacked && <Icon name="arrow-right" className="rule-comparison-arrow text-ink-3" />}
								{values ? values.after : <bdi dir="auto">{part.value}</bdi>}
							</ins>
						)}
					</Fragment>
				))}
			</p>
			{overflow && (
				<Button
					variant="secondary"
					className="justify-self-start"
					aria-expanded={expanded}
					aria-controls={id}
					onClick={() => setExpandedValue(expanded ? null : { before, after })}
				>
					{expanded ? labels.showLess : labels.showMore}
				</Button>
			)}
		</div>
	);
}
