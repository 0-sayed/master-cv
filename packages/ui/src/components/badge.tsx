import type { VariantProps } from "class-variance-authority";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva } from "class-variance-authority";
import { cn } from "@reactive-resume/utils/style";

/** Status pills. Color always pairs with text; never use a badge as the only signal. */
const badgeVariants = cva(
	"group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 font-medium whitespace-nowrap [&>[data-slot=icon]]:text-[15px]! [&>svg]:pointer-events-none [&>svg]:size-3!",
	{
		variants: {
			shape: {
				pill: "type-metadata",
				circle: "grid size-6 place-items-center gap-0 border-2 p-0 type-count tabular-nums",
			},
			variant: {
				neutral: "bg-sunken text-ink-2",
				accent: "bg-accent-soft text-accent-text",
				solid: "bg-accent text-on-accent",
				warn: "bg-warn-soft text-warn-text",
				"warn-solid": "border-paper bg-warn text-paper-ink shadow-e1",
				danger: "bg-danger-soft text-danger-text",
				info: "bg-info-soft text-info-text",
				outline: "border-line-2 text-ink-2",
				inverse: "bg-ink text-bg",
			},
		},
		defaultVariants: {
			shape: "pill",
			variant: "neutral",
		},
	},
);

function CountBadge(props: React.ComponentProps<typeof Badge>) {
	return <Badge variant="accent" {...props} className={cn("h-6 font-semibold tabular-nums", props.className)} />;
}

function Badge({
	className,
	variant = "neutral",
	shape = "pill",
	render,
	...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
	return useRender({
		defaultTagName: "span",
		props: mergeProps<"span">(
			{
				className: cn(badgeVariants({ variant, shape }), className),
			},
			props,
		),
		render,
		state: {
			slot: "badge",
			variant,
		},
	});
}

export { Badge, CountBadge, badgeVariants };
