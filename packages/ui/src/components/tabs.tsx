import type { VariantProps } from "class-variance-authority";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva } from "class-variance-authority";
import { cn } from "@reactive-resume/utils/style";
import { CountBadge } from "./badge";

function Tabs({ className, orientation = "horizontal", ...props }: TabsPrimitive.Root.Props) {
	return (
		<TabsPrimitive.Root
			data-slot="tabs"
			data-orientation={orientation}
			orientation={orientation}
			className={cn("group/tabs flex max-w-full gap-2 data-horizontal:flex-col", className)}
			{...props}
		/>
	);
}

/**
 * `default` is the segmented control used for modes (a sunken track with a raised selected
 * segment). `line` is the underline tab strip used for filters and sheet sections; its underline slides like the pill.
 */
const tabsListVariants = cva(
	"group/tabs-list relative inline-flex w-fit max-w-full items-center group-data-horizontal/tabs:overflow-x-auto group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
	{
		variants: {
			variant: {
				default: "rounded-md bg-sunken p-1 text-ink-2 group-data-horizontal/tabs:h-9",
				line: "gap-4 border-b border-line text-ink-2 group-data-horizontal/tabs:h-10",
			},
			size: {
				touch: "group-data-horizontal/tabs:h-auto",
				panel: "w-full gap-0 group-data-horizontal/tabs:h-(--space-56)",
				review: "w-full gap-0.5 group-data-horizontal/tabs:h-11 group-data-horizontal/tabs:overflow-visible",
				compact: "gap-1 group-data-horizontal/tabs:h-11 group-data-horizontal/tabs:overflow-visible",
				toolbar: "group-data-horizontal/tabs:h-11 pointer-coarse:group-data-horizontal/tabs:h-12",
				page: "w-full gap-1 group-data-horizontal/tabs:h-(--space-56) group-data-horizontal/tabs:overflow-visible sm:w-fit",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

function TabsList({
	className,
	variant = "default",
	layout = "scroll",
	size,
	children,
	...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants> & { layout?: "scroll" | "wrap" | "equal" }) {
	return (
		<TabsPrimitive.List
			data-slot="tabs-list"
			data-variant={variant}
			data-size={size}
			data-layout={layout}
			className={cn(
				tabsListVariants({ variant, size }),
				layout === "equal" && "w-full",
				layout === "wrap" &&
					"h-auto flex-wrap group-data-horizontal/tabs:h-auto group-data-horizontal/tabs:overflow-visible",
				className,
			)}
			{...props}
		>
			<TabsIndicator />
			{children}
		</TabsPrimitive.List>
	);
}

/**
 * Slides to the active tab: the raised pill on `default`, a 2px ink underline on `line`. Movement uses the
 * on-screen curve; a list with `data-instant` (keyboard mode switches) jumps instead.
 */
function TabsIndicator({ className, ...props }: TabsPrimitive.Indicator.Props) {
	return (
		<TabsPrimitive.Indicator
			data-slot="tabs-indicator"
			className={cn(
				"absolute left-0 w-(--active-tab-width) translate-x-(--active-tab-left) transition-[translate,width,height] duration-standard ease-in-out-strong group-data-instant/tabs-list:transition-none",
				"group-data-[variant=default]/tabs-list:top-0 group-data-[variant=default]/tabs-list:h-(--active-tab-height) group-data-[variant=default]/tabs-list:translate-y-(--active-tab-top) group-data-[variant=default]/tabs-list:rounded-sm group-data-[variant=default]/tabs-list:bg-raised group-data-[variant=default]/tabs-list:shadow-e1",
				"group-data-[size=panel]/tabs-list:bg-accent group-data-[variant=line]/tabs-list:bottom-0 group-data-[variant=line]/tabs-list:h-0.5 group-data-[variant=line]/tabs-list:bg-ink",
				className,
			)}
			{...props}
		/>
	);
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
	return (
		<TabsPrimitive.Tab
			data-slot="tabs-trigger"
			className={cn(
				"touch-target relative inline-flex min-w-fit items-center justify-center gap-1.5 font-medium whitespace-nowrap transition-colors duration-quick group-data-[layout=equal]/tabs-list:min-w-0 group-data-[layout=equal]/tabs-list:flex-1 group-data-[size=touch]/tabs-list:min-h-11 group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-ink disabled:pointer-events-none disabled:text-ink-3 aria-disabled:pointer-events-none aria-disabled:text-ink-3 data-active:text-ink group-data-[size=panel]/tabs-list:data-active:text-accent-text [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				"group-data-[variant=default]/tabs-list:h-full group-data-[variant=default]/tabs-list:flex-1 group-data-[variant=default]/tabs-list:rounded-sm group-data-[variant=default]/tabs-list:px-3 group-data-[variant=default]/tabs-list:type-label",
				"group-data-[size=page]/tabs-list:min-w-0 group-data-[size=page]/tabs-list:gap-1 group-data-[size=page]/tabs-list:type-body group-data-[size=page]/tabs-list:font-medium! group-data-[variant=default]/tabs-list:group-data-[size=page]/tabs-list:px-2 sm:group-data-[size=page]/tabs-list:min-w-fit sm:group-data-[variant=default]/tabs-list:group-data-[size=page]/tabs-list:flex-none sm:group-data-[variant=default]/tabs-list:group-data-[size=page]/tabs-list:px-4 group-data-[size=page]/tabs-list:data-active:text-accent-text group-data-[size=page]/tabs-list:[&>[data-slot=tabs-count]]:px-1 sm:group-data-[size=page]/tabs-list:[&>[data-slot=tabs-count]]:px-2 group-data-[size=page]/tabs-list:[&>span]:shrink-0",
				"group-data-[variant=line]/tabs-list:h-full group-data-[variant=line]/tabs-list:type-body",
				"group-data-[size=compact]/tabs-list:flex-auto group-data-[size=compact]/tabs-list:shrink-0 group-data-[size=compact]/tabs-list:gap-1 group-data-[variant=line]/tabs-list:group-data-[size=compact]/tabs-list:type-metadata",
				"group-data-[size=review]/tabs-list:flex-auto group-data-[size=review]/tabs-list:shrink-0 group-data-[size=review]/tabs-list:gap-0.5 group-data-[size=review]/tabs-list:type-control-compact! group-data-[size=review]/tabs-list:[&>[data-slot=icon]]:type-metadata! group-data-[size=review]/tabs-list:[&>[data-slot=tabs-count]]:px-0.5 group-data-[size=review]/tabs-list:[&>[data-slot=tabs-count]]:type-control-compact",
				className,
			)}
			{...props}
		/>
	);
}

/** A count after a tab label, in mono. */
function TabsCount({ className, ...props }: React.ComponentProps<"span">) {
	return <CountBadge data-slot="tabs-count" className={className} {...props} />;
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
	return <TabsPrimitive.Panel data-slot="tabs-content" className={cn("flex-1 type-body", className)} {...props} />;
}

export { Tabs, TabsContent, TabsCount, TabsIndicator, TabsList, TabsTrigger, tabsListVariants };
