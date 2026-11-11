import type { ComponentProps } from "react";
import { cn } from "@reactive-resume/utils/style";

/** Shared dashboard sections size to content without shrinking interactive hit areas. */
function SectionCard({ className, ...props }: ComponentProps<"section">) {
	return (
		<section
			data-slot="section-card"
			className={cn("grid content-start gap-3 rounded-xl border border-line bg-surface p-4", className)}
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
	return <header data-slot="section-card-header" className={cn("flex items-center gap-3", className)} {...props} />;
}

function SectionCardRow({
	className,
	variant = "outlined",
	...props
}: ComponentProps<"article"> & { variant?: "outlined" | "plain" }) {
	return (
		<article
			data-slot="section-card-row"
			className={cn(
				"group flex items-center gap-2 p-2",
				variant === "plain" ? "border-b border-line last:border-0" : "rounded-md border border-line bg-raised",
				className,
			)}
			{...props}
		/>
	);
}

export { SectionCard, SectionCardEmpty, SectionCardHeader, SectionCardRow };
