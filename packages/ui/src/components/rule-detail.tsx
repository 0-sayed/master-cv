import type { ReactNode } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./accordion";
import { Icon } from "./icon";
import { SuggestionDiff } from "./suggestion-diff";

type RuleDetailProps = {
	why: string;
	example?: { before: string; after: string } | null;
	comparison?: ReactNode;
	labels: { why: string; before: string; after: string; showMore: string; showLess: string };
	compact?: boolean;
	direction?: "rtl" | "ltr";
};

/** Guide explanations and editor findings share the same comparison and reason. */
export function RuleDetail({ why, example, comparison, labels, compact = false, direction }: RuleDetailProps) {
	const reason = <p className="type-body text-ink-2">{why}</p>;
	return (
		<div data-slot="rule-detail" dir={direction} className="grid min-w-0 gap-2">
			{!compact && (
				<div className="grid gap-1">
					<h3 className="flex items-center gap-1.5 type-label text-ink">
						<Icon name="lightbulb" />
						{labels.why}
					</h3>
					{reason}
				</div>
			)}
			{comparison ?? (example && <SuggestionDiff before={example.before} after={example.after} labels={labels} />)}
			{compact && (
				<Accordion defaultValue={[]}>
					<AccordionItem value="why">
						<AccordionTrigger>{labels.why}</AccordionTrigger>
						<AccordionContent>{reason}</AccordionContent>
					</AccordionItem>
				</Accordion>
			)}
		</div>
	);
}
