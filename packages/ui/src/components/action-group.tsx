import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@reactive-resume/utils/style";

// A shared visible secondary treatment; the single explicit primary keeps its emphasis.
const actionGroupVariants = cva(
	"flex flex-wrap items-center justify-start gap-2 [&_[data-slot=button]:not([data-variant=primary]):not([data-variant=danger])]:bg-surface [&_[data-slot=button]:not([data-variant=primary]):not([data-variant=danger]):hover]:bg-hover",
	{
		variants: {
			tone: {
				default:
					"[&_[data-slot=button]:not([data-variant=primary]):not([data-variant=danger])]:border-line-2 [&_[data-slot=button]:not([data-variant=primary]):not([data-variant=danger])]:text-ink",
				info: "[&_[data-slot=button]:not([data-variant=primary]):not([data-variant=danger])]:border-info-text [&_[data-slot=button]:not([data-variant=primary]):not([data-variant=danger])]:text-info-text",
				warn: "[&_[data-slot=button]:not([data-variant=primary]):not([data-variant=danger])]:border-warn-text [&_[data-slot=button]:not([data-variant=primary]):not([data-variant=danger])]:text-warn-text",
				error:
					"[&_[data-slot=button]:not([data-variant=primary]):not([data-variant=danger])]:border-danger-text [&_[data-slot=button]:not([data-variant=primary]):not([data-variant=danger])]:text-danger-text",
				success:
					"[&_[data-slot=button]:not([data-variant=primary]):not([data-variant=danger])]:border-accent-text [&_[data-slot=button]:not([data-variant=primary]):not([data-variant=danger])]:text-accent-text",
			},
		},
		defaultVariants: { tone: "default" },
	},
);
type ActionGroupProps = ComponentProps<"div"> & VariantProps<typeof actionGroupVariants>;
export function ActionGroup({ className, tone, ...props }: ActionGroupProps) {
	return <div data-slot="action-group" className={cn(actionGroupVariants({ tone }), className)} {...props} />;
}
