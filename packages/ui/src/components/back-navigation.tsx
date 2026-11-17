import type { ReactNode } from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { buttonVariants } from "./button";
import { Icon } from "./icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

type BackNavigationProps = Omit<useRender.ComponentProps<"button">, "children"> & {
	children: ReactNode;
	iconOnly?: boolean;
};

/** Render a parent link, or a button for an in-place step. Icon owns RTL mirroring. */
function BackNavigation({ children, iconOnly = false, render, ...props }: BackNavigationProps) {
	const element = useRender({
		defaultTagName: "button",
		render,
		props: mergeProps<"button">(
			{
				...(render ? {} : { type: "button" as const }),
				className: buttonVariants({
					variant: "ghost",
					size: iconOnly ? "header-icon" : "header",
					className: "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
				}),
				children: (
					<>
						<Icon name="arrow-left" />
						<span className={iconOnly ? "sr-only" : undefined}>{children}</span>
					</>
				),
			},
			props,
		),
		state: { slot: "back-navigation", variant: "ghost", size: iconOnly ? "header-icon" : "header" },
	});
	return iconOnly ? (
		<Tooltip>
			<TooltipTrigger render={element} />
			<TooltipContent>{children}</TooltipContent>
		</Tooltip>
	) : (
		element
	);
}

export { BackNavigation, type BackNavigationProps };
