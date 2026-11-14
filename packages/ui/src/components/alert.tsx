import type { VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cva } from "class-variance-authority";
import { createContext, useContext } from "react";
import { cn } from "@reactive-resume/utils/style";
import { ActionGroup } from "./action-group";

/** Inline notices use shared type, spacing and a text-column action footer. Errors are announced (`role="alert"`); the rest are static. */
const alertVariants = cva(
	"group/alert relative grid w-full gap-1 rounded-lg p-4 text-start type-body has-[>[data-slot=icon]]:grid-cols-[auto_minmax(0,1fr)] has-[>[data-slot=icon]]:gap-x-3 has-[>svg]:grid-cols-[auto_minmax(0,1fr)] has-[>svg]:gap-x-3 [&>[data-slot=icon]]:row-start-1 [&>[data-slot=icon]]:self-start [&>svg]:row-start-1 [&>svg]:self-start [&>svg]:text-current [&>svg:not([class*='size-'])]:size-5",
	{
		variants: {
			variant: {
				default: "bg-sunken text-ink-2",
				info: "bg-info-soft text-info-text",
				success: "bg-accent-soft text-accent-text",
				warn: "bg-warn-soft text-warn-text",
				error: "bg-danger-soft text-danger-text",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

const AlertToneContext = createContext<NonNullable<VariantProps<typeof alertVariants>["variant"]>>("default");

function Alert({
	className,
	variant = "default",
	...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
	return (
		<AlertToneContext.Provider value={variant ?? "default"}>
			<div
				data-slot="alert"
				data-variant={variant}
				role={variant === "error" ? "alert" : undefined}
				className={cn(alertVariants({ variant }), className)}
				{...props}
			/>
		</AlertToneContext.Provider>
	);
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="alert-title"
			className={cn(
				"font-semibold group-has-[>[data-slot=icon]]/alert:col-start-2 group-has-[>svg]/alert:col-start-2",
				className,
			)}
			{...props}
		/>
	);
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="alert-description"
			className={cn(
				"text-pretty group-has-[>[data-slot=icon]]/alert:col-start-2 group-has-[>svg]/alert:col-start-2 [&_p:not(:last-child)]:mb-2",
				className,
			)}
			{...props}
		/>
	);
}

function AlertActions({ className, ...props }: React.ComponentProps<"div">) {
	const tone = useContext(AlertToneContext);
	return (
		<ActionGroup
			data-slot="alert-actions"
			tone={tone}
			className={cn(
				"mt-2 group-has-[>[data-slot=icon]]/alert:col-start-2 group-has-[>svg]/alert:col-start-2 empty:hidden",
				className,
			)}
			{...props}
		/>
	);
}

export { AlertActions, Alert, AlertDescription, AlertTitle, alertVariants };
