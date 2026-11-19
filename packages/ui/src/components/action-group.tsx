import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@reactive-resume/utils/style";

// A shared visible secondary treatment; the single explicit primary keeps its emphasis.
const actionGroupVariants = cva(
	"flex flex-wrap items-center justify-start gap-2 [&_[data-slot=button]:not([data-variant=primary]):not([data-variant=danger]):not([data-variant=ghost])]:bg-surface [&_[data-slot=button]:not([data-variant=primary]):not([data-variant=danger]):not([data-variant=ghost]):hover]:bg-hover",
	{
		variants: {
			density: { default: "", compact: "gap-1" },
			responsive: { wrap: "", stack: "max-sm:flex-col max-sm:items-stretch max-sm:[&>*]:w-full" },
			tone: {
				default:
					"[&_[data-slot=button]:not([data-variant=primary]):not([data-variant=danger]):not([data-variant=ghost])]:border-line-2 [&_[data-slot=button]:not([data-variant=primary]):not([data-variant=danger]):not([data-variant=ghost])]:text-ink",
				info: "[&_[data-slot=button]:not([data-variant=primary]):not([data-variant=danger]):not([data-variant=ghost])]:border-info-text [&_[data-slot=button]:not([data-variant=primary]):not([data-variant=danger]):not([data-variant=ghost])]:text-info-text",
				warn: "[&_[data-slot=button]:not([data-variant=primary]):not([data-variant=danger]):not([data-variant=ghost])]:border-warn-text [&_[data-slot=button]:not([data-variant=primary]):not([data-variant=danger]):not([data-variant=ghost])]:text-warn-text",
				error:
					"[&_[data-slot=button]:not([data-variant=primary]):not([data-variant=danger]):not([data-variant=ghost])]:border-danger-text [&_[data-slot=button]:not([data-variant=primary]):not([data-variant=danger]):not([data-variant=ghost])]:text-danger-text",
				success:
					"[&_[data-slot=button]:not([data-variant=primary]):not([data-variant=danger]):not([data-variant=ghost])]:border-accent-text [&_[data-slot=button]:not([data-variant=primary]):not([data-variant=danger]):not([data-variant=ghost])]:text-accent-text",
			},
		},
		defaultVariants: { tone: "default", responsive: "wrap", density: "default" },
	},
);
type ActionGroupProps = ComponentProps<"div"> & VariantProps<typeof actionGroupVariants>;
export function ActionGroup({ className, tone, responsive, density, ...props }: ActionGroupProps) {
	return (
		<div
			data-slot="action-group"
			className={cn(actionGroupVariants({ tone, responsive, density }), className)}
			{...props}
		/>
	);
}
