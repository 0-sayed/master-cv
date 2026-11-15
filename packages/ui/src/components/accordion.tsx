import type { IconName } from "@reactive-resume/ui/components/icon";
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { Icon } from "@reactive-resume/ui/components/icon";
import { cn } from "@reactive-resume/utils/style";

function Accordion({ className, ...props }: AccordionPrimitive.Root.Props) {
	return <AccordionPrimitive.Root data-slot="accordion" className={cn("flex w-full flex-col", className)} {...props} />;
}

function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
	return (
		<AccordionPrimitive.Item
			data-slot="accordion-item"
			className={cn("not-last:border-b not-last:border-line", className)}
			{...props}
		/>
	);
}

type AccordionTriggerProps = AccordionPrimitive.Trigger.Props & { icon?: IconName };
function AccordionTrigger({ className, children, icon, ...props }: AccordionTriggerProps) {
	return (
		<AccordionPrimitive.Header className="flex">
			<AccordionPrimitive.Trigger
				data-slot="accordion-trigger"
				className={cn(
					"group/accordion-trigger touch-target relative flex min-h-11 flex-1 items-center justify-between gap-2 rounded-md py-2.5 text-start type-label text-ink aria-disabled:pointer-events-none aria-disabled:text-ink-3 **:data-[slot=accordion-trigger-icon]:ms-auto **:data-[slot=accordion-trigger-icon]:text-ink-3",
					className,
				)}
				{...props}
			>
				{icon && <Icon name={icon} className="shrink-0 text-ink-2" />}
				<span className="min-w-0 flex-1">{children}</span>
				<Icon
					name="caret-down"
					data-slot="accordion-trigger-icon"
					className="pointer-events-none transition-transform duration-standard ease-enter group-aria-expanded/accordion-trigger:rotate-180"
				/>
			</AccordionPrimitive.Trigger>
		</AccordionPrimitive.Header>
	);
}

function AccordionContent({ className, children, ...props }: AccordionPrimitive.Panel.Props) {
	return (
		<AccordionPrimitive.Panel
			data-slot="accordion-content"
			className="h-(--accordion-panel-height) overflow-hidden type-body text-ink-2 transition-[height] duration-standard ease-enter data-ending-style:h-0 data-ending-style:duration-[calc(var(--d2)*0.7)] data-starting-style:h-0"
			{...props}
		>
			<div className={cn("pt-0 pb-2.5 [&_p:not(:last-child)]:mb-4", className)}>{children}</div>
		</AccordionPrimitive.Panel>
	);
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
