import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import { cn } from "@reactive-resume/utils/style";

const buttonGroupVariants = cva(
	"flex w-fit items-stretch *:focus-visible:relative *:focus-visible:z-10 *:active:scale-100! has-[>[data-slot=button-group]]:gap-2 has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-e-md [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1",
	{
		variants: {
			orientation: {
				horizontal:
					"*:data-slot:rounded-e-none [&>[data-slot]:not(:has(~[data-slot]))]:rounded-e-md! [&>[data-slot]~[data-slot]]:rounded-s-none",
				vertical:
					"flex-col *:data-slot:rounded-b-none [&>[data-slot]:not(:has(~[data-slot]))]:rounded-b-md! [&>[data-slot]~[data-slot]]:rounded-t-none [&>[data-slot]~[data-slot]]:border-t-0",
			},
			variant: {
				default: "",
				split: "[&>[data-slot]~[data-slot]]:border-s-current/40",
			},
		},
		compoundVariants: [
			{ orientation: "horizontal", variant: "default", className: "[&>[data-slot]~[data-slot]]:border-s-0" },
		],
		defaultVariants: {
			orientation: "horizontal",
			variant: "default",
		},
	},
);

function ButtonGroup({
	className,
	orientation,
	variant,
	...props
}: React.ComponentProps<"fieldset"> & VariantProps<typeof buttonGroupVariants>) {
	return (
		<fieldset
			data-slot="button-group"
			data-orientation={orientation}
			className={cn(buttonGroupVariants({ orientation, variant }), className)}
			{...props}
		/>
	);
}

export { ButtonGroup, buttonGroupVariants };
