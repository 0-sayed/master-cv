import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { cn } from "@reactive-resume/utils/style";

/** Wrapping, single-choice chips for template and finding filters. */
export function FilterChips({ className, ...props }: RadioGroup.Props) {
	return (
		<RadioGroup data-slot="filter-chips" className={cn("flex flex-wrap items-center gap-1.5", className)} {...props} />
	);
}

const chipTones = {
	accent: "data-checked:border-accent data-checked:bg-accent-soft data-checked:text-accent-text",
	neutral: "[&>[data-slot=icon]]:text-ink data-checked:border-ink data-checked:bg-sunken data-checked:text-ink",
	danger:
		"[&>[data-slot=icon]]:text-danger-text data-checked:border-danger-text data-checked:bg-danger-soft data-checked:text-danger-text",
	warn: "[&>[data-slot=icon]]:text-warn-text data-checked:border-warn-text data-checked:bg-warn-soft data-checked:text-warn-text",
	info: "[&>[data-slot=icon]]:text-info-text data-checked:border-info-text data-checked:bg-info-soft data-checked:text-info-text",
};

export function FilterChip({
	className,
	tone = "accent",
	...props
}: Radio.Root.Props & { tone?: keyof typeof chipTones }) {
	return (
		<Radio.Root
			data-slot="filter-chip"
			data-tone={tone}
			className={cn(
				"touch-target relative inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border border-line-2 px-3 type-label whitespace-nowrap text-ink-2 transition-colors duration-quick not-data-checked:hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
				chipTones[tone],
				className,
			)}
			{...props}
		/>
	);
}
