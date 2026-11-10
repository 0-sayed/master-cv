import { cva } from "class-variance-authority";
import { cn } from "@reactive-resume/utils/style";
import { buttonVariants } from "./button";

/** The loaded card and its placeholder share one responsive layout contract. */
export const documentCardLayout = {
	surface: cva("group/card grid gap-2", {
		variants: {
			library: {
				true: "overflow-hidden rounded-xl border border-line bg-surface max-sm:grid-cols-[var(--space-56)_minmax(0,1fr)] max-sm:items-center max-sm:gap-3 max-sm:p-3",
			},
		},
	}),
	preview: cva("relative", {
		variants: { library: { true: "sm:h-48 sm:overflow-hidden sm:bg-sunken sm:pt-5" } },
	}),
	page: cva("relative block aspect-page overflow-hidden rounded-sm", {
		variants: { library: { true: "max-sm:h-18 max-sm:w-14 sm:mx-auto sm:w-44" } },
	}),
	details: cva("flex items-start gap-1", {
		variants: { library: { true: "sm:px-4 sm:pt-2" } },
	}),
	action: cn(buttonVariants({ variant: "secondary" }), "mx-4 mb-4 hidden sm:flex"),
	row: "border-b border-line",
	cell: "py-3 ps-3 pe-2",
};
