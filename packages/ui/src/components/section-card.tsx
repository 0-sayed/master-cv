import type { ComponentProps } from "react";
import { cn } from "@reactive-resume/utils/style";

/** Shared dashboard sections use compact content spacing without shrinking interactive hit areas. */
export type SectionCardCapacity = "entries" | "entry" | "chips" | "notice";

function SectionCard({
	className,
	capacity,
	...props
}: ComponentProps<"section"> & { capacity?: SectionCardCapacity }) {
	return (
		<section
			data-slot="section-card"
			data-capacity={capacity}
			className={cn(
				"grid content-start gap-3 rounded-xl border border-line bg-surface p-4",
				capacity && "section-card-reserved",
				className,
			)}
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

export { SectionCard, SectionCardHeader, SectionCardRow };
