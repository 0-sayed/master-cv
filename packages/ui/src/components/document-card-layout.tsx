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
		variants: {
			library: {
				true: "sm:h-(--document-preview-height) sm:overflow-hidden sm:bg-sunken sm:pt-5 sm:[--document-preview-height:calc(var(--space-48)*4)] sm:[--preview-visible-height:calc(var(--document-preview-height)-var(--space-20))]",
			},
		},
	}),
	page: cva("relative block aspect-page overflow-hidden rounded-sm", {
		variants: { library: { true: "max-sm:h-18 max-sm:w-14 sm:mx-auto sm:w-44" } },
	}),
	details: cva("flex items-start gap-1", {
		variants: { library: { true: "sm:px-4 sm:pt-2" } },
	}),
	action: cn(buttonVariants({ variant: "secondary" }), "mx-4 mb-4 hidden sm:flex"),
	trashTable: "w-full border-collapse max-sm:block",
	trashBody: "max-sm:grid max-sm:gap-3",
	trashRow:
		"border-b border-line max-sm:grid max-sm:grid-cols-[auto_minmax(0,1fr)] max-sm:gap-3 max-sm:rounded-xl max-sm:border max-sm:bg-surface max-sm:p-4",
	trashSelection: "w-10 py-3 ps-3 max-sm:row-span-2 max-sm:w-auto max-sm:p-0",
	trashName: "min-w-0 px-3 py-3 max-sm:p-0",
	trashIdentity: "flex min-w-0 items-center gap-3",
	trashRetention: "px-3 py-3 max-sm:col-start-2 max-sm:p-0",
	trashActions: "py-3 pe-3 max-sm:col-span-full max-sm:p-0",
	row: "border-b border-line",
	cell: "py-3 ps-3 pe-2",
};
