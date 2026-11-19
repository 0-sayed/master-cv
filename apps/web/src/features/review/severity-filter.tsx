import { t } from "@lingui/core/macro";
import { FilterChip, FilterChips } from "@reactive-resume/ui/components/filter-chips";
import { Icon } from "@reactive-resume/ui/components/icon";

export type SeverityFilterValue = "all" | "blocker" | "warning" | "tip";

export function SeverityFilter({
	value,
	onChange,
	counts,
	label,
}: {
	value: SeverityFilterValue;
	onChange: (value: SeverityFilterValue) => void;
	counts: Record<Exclude<SeverityFilterValue, "all">, number>;
	label: string;
}) {
	const options = [
		{
			value: "all",
			tone: "neutral",
			label: t({ message: "All", context: "review.severity.all" }),
			icon: "funnel",
			count: counts.blocker + counts.warning + counts.tip,
		},
		{
			value: "blocker",
			tone: "danger",
			label: t({ message: "Blocker", context: "review.severity.blocker" }),
			icon: "warning-circle",
			count: counts.blocker,
		},
		{
			value: "warning",
			tone: "warn",
			label: t({ message: "Warning", context: "review.severity.warning" }),
			icon: "warning",
			count: counts.warning,
		},
		{
			value: "tip",
			tone: "info",
			label: t({ message: "Tip", context: "review.filter.tip" }),
			icon: "info",
			count: counts.tip,
		},
	] as const;
	return (
		<FilterChips aria-label={label} value={value} onValueChange={(next) => onChange(next as SeverityFilterValue)}>
			{options
				.filter((option) => option.value === "all" || option.count > 0)
				.map((option) => (
					<FilterChip key={option.value} value={option.value} tone={option.tone}>
						<Icon name={option.icon} />
						{option.label} <bdi dir="ltr">{option.count}</bdi>
					</FilterChip>
				))}
		</FilterChips>
	);
}
