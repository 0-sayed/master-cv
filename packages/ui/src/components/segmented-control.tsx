import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Children, isValidElement, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@reactive-resume/utils/style";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

/**
 * A small set of options (2–4) as segments on a sunken track; the chosen one is raised. It's a
 * radio group, so arrow keys move between options. Use `Tabs` instead when segments switch panels.
 */
type SegmentedControlProps = RadioGroup.Props & {
	size?: "default" | "toolbar";
	/** `accent` fills the chosen segment with the accent color, for choices that drive a visible example. */
	variant?: "default" | "accent";
	"data-wrap"?: boolean;
};

function SegmentedControl({ className, size = "default", variant = "default", ...props }: SegmentedControlProps) {
	const ref = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		const element = ref.current;
		if (!element) return;
		const measure = () => {
			element.removeAttribute("data-icon-only");
			const items = [...element.querySelectorAll<HTMLElement>('[data-slot="segmented-control-item"]')];
			const allHaveIcons =
				items.length > 0 && items.every((item) => item.querySelector('[data-slot="segmented-control-icon"]'));
			const required = items.reduce((total, item) => {
				const label = item.querySelector<HTMLElement>('[data-slot="segmented-control-label"]');
				const style = getComputedStyle(item);
				return (
					total +
					(label?.scrollWidth ?? 0) +
					Number.parseFloat(style.paddingInlineStart || "0") +
					Number.parseFloat(style.paddingInlineEnd || "0")
				);
			}, 0);
			const style = getComputedStyle(element);
			const available =
				element.clientWidth -
				Number.parseFloat(style.paddingInlineStart || "0") -
				Number.parseFloat(style.paddingInlineEnd || "0") -
				(items.length - 1) * Number.parseFloat(style.columnGap || "0");
			if (allHaveIcons && available > 0 && required > available) element.setAttribute("data-icon-only", "true");
		};
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		measure();
		void document.fonts?.ready.then(measure);
		return () => observer.disconnect();
	}, [props.children]);
	return (
		<RadioGroup
			ref={ref}
			data-slot="segmented-control"
			data-variant={variant}
			className={cn(
				"inline-flex min-h-9 max-w-full flex-wrap items-stretch gap-0.5 rounded-md bg-sunken p-1 pointer-coarse:min-h-12",
				size === "toolbar" && "min-h-11",
				className,
			)}
			{...props}
		/>
	);
}

function SegmentedControlItem({
	className,
	children,
	labelOverflow = "visible",
	...props
}: Radio.Root.Props & { labelOverflow?: "truncate" | "visible" }) {
	const ref = useRef<HTMLSpanElement>(null);
	const [label, setLabel] = useState("");
	const icon = Children.toArray(children).find(
		(child) => isValidElement<{ name?: string }>(child) && typeof child.props.name === "string",
	);
	useLayoutEffect(() => {
		setLabel(ref.current?.textContent ?? "");
	}, [children]);
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Radio.Root
						data-slot="segmented-control-item"
						aria-label={props["aria-label"] ?? (label || undefined)}
						title={props.title ?? (label || undefined)}
						className={cn(
							"touch-target relative inline-flex min-h-[calc(1lh+var(--space-8))] min-w-0 flex-1 basis-0 items-center justify-center gap-1.5 rounded-sm px-3 type-label whitespace-nowrap text-ink-2 transition-[background-color,color,box-shadow] duration-quick not-data-checked:hover:text-ink pointer-coarse:min-h-0 pointer-coarse:min-w-0 data-checked:bg-raised data-checked:text-ink data-checked:shadow-e1 in-data-[variant=accent]:data-checked:bg-accent in-data-[variant=accent]:data-checked:text-on-accent data-disabled:pointer-events-none data-disabled:text-ink-3",
							className,
						)}
						{...props}
					/>
				}
			>
				<span
					ref={ref}
					data-slot="segmented-control-label"
					data-overflow={labelOverflow}
					className={cn(
						"inline-flex min-w-0 items-center justify-center gap-1.5 text-center [&>svg]:shrink-0",
						icon ? "whitespace-nowrap" : "whitespace-normal",
					)}
				>
					{children}
				</span>
				{icon && (
					<span data-slot="segmented-control-icon" aria-hidden="true" className="hidden">
						{icon}
					</span>
				)}
			</TooltipTrigger>
			<TooltipContent>{props["aria-label"] ?? label}</TooltipContent>
		</Tooltip>
	);
}

export { SegmentedControl, SegmentedControlItem };
