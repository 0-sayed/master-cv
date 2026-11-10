import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { cn } from "@reactive-resume/utils/style";

/**
 * A small set of options (2–4) as segments on a sunken track; the chosen one is raised. It's a
 * radio group, so arrow keys move between options. Use `Tabs` instead when segments switch panels.
 */
type SegmentedControlProps = RadioGroup.Props & { size?: "default" | "toolbar" };

function SegmentedControl({ className, size = "default", ...props }: SegmentedControlProps) {
	return (
		<RadioGroup
			data-slot="segmented-control"
			className={cn(
				"inline-flex h-9 items-stretch gap-0.5 rounded-md bg-sunken p-1 pointer-coarse:h-12",
				size === "toolbar" && "h-11",
				className,
			)}
			{...props}
		/>
	);
}

function SegmentedControlItem({ className, ...props }: Radio.Root.Props) {
	return (
		<Radio.Root
			data-slot="segmented-control-item"
			className={cn(
				"touch-target relative inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm px-3 type-label whitespace-nowrap text-ink-2 transition-[background-color,color,box-shadow] duration-quick not-data-checked:hover:text-ink pointer-coarse:min-h-0 pointer-coarse:min-w-11 data-checked:bg-raised data-checked:text-ink data-checked:shadow-e1 data-disabled:pointer-events-none data-disabled:text-ink-3",
				className,
			)}
			{...props}
		/>
	);
}

export { SegmentedControl, SegmentedControlItem };
