import type { ComponentProps } from "react";
import { cn } from "@reactive-resume/utils/style";

/** Shared dashboard sections size to content without shrinking interactive hit areas. */
function SectionCard({
	className,
	variant = "default",
	tone = "default",
	...props
}: ComponentProps<"section"> & {
	variant?: "default" | "flush" | "compact" | "spacious";
	tone?: "default" | "highlight";
}) {
	return (
		<section
			data-slot="section-card"
			data-variant={variant}
			data-tone={tone}
			className={cn(
				"group/section-card grid content-start rounded-xl border border-line bg-surface",
				variant === "flush"
					? "divide-y divide-line"
					: variant === "compact"
						? "gap-2 p-3"
						: variant === "spacious"
							? "gap-6 p-4 sm:p-6 lg:p-8"
							: "gap-3 p-4",
				tone === "highlight" && "border-accent bg-accent-soft text-accent-text",
				className,
			)}
			{...props}
		/>
	);
}

/** Empty content and its loading placeholder share the same text and surface geometry. */
function SectionCardEmpty({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			data-slot="section-card-empty"
			className={cn("rounded-lg border border-dashed border-line p-3 type-body text-ink-3", className)}
			{...props}
		/>
	);
}

function SectionCardHeader({ className, ...props }: ComponentProps<"header">) {
	return (
		<header
			data-slot="section-card-header"
			className={cn("flex items-center gap-3 group-data-[variant=flush]/section-card:p-4", className)}
			{...props}
		/>
	);
}

function SectionCardBody({ className, ...props }: ComponentProps<"div">) {
	return <div data-slot="section-card-body" className={cn("grid gap-4 p-4", className)} {...props} />;
}

function SectionCardTitle({
	className,
	children,
	as: Heading = "h3",
	...props
}: ComponentProps<"h3"> & { as?: "h2" | "h3" }) {
	return (
		<Heading data-slot="section-card-title" className={cn("type-section text-ink", className)} {...props}>
			{children}
		</Heading>
	);
}

function SectionCardRow({
	className,
	variant = "outlined",
	align = "center",
	density = "default",
	...props
}: ComponentProps<"article"> & {
	variant?: "outlined" | "plain";
	align?: "center" | "start";
	density?: "default" | "compact";
}) {
	return (
		<article
			data-slot="section-card-row"
			className={cn(
				"group flex gap-2 px-2",
				density === "compact" ? "py-1" : "py-2",
				align === "start" ? "items-start" : "items-center",
				variant === "plain" ? "border-b border-line last:border-0" : "rounded-md border border-line bg-raised",
				className,
			)}
			{...props}
		/>
	);
}

export { SectionCard, SectionCardBody, SectionCardEmpty, SectionCardHeader, SectionCardRow, SectionCardTitle };
