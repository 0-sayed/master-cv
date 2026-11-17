import { cva } from "class-variance-authority";
import { cn } from "@reactive-resume/utils/style";
import { buttonVariants } from "./button";

/** The loaded card and its placeholder share one responsive layout contract. */
export const documentCardLayout = {
	surface: cva("group/card grid gap-2", {
		variants: {
			library: {
				true: "overflow-hidden rounded-xl border border-line bg-surface max-sm:grid-cols-[calc(var(--space-56)*2)_minmax(0,1fr)] max-sm:items-center max-sm:gap-3 max-sm:p-3",
			},
		},
	}),
	preview: cva("relative bg-sunken data-[document-type=letter]:bg-info-soft", {
		variants: {
			library: {
				true: "sm:h-(--document-preview-height) sm:overflow-hidden sm:pt-10 sm:[--document-preview-height:calc(var(--space-48)*4)] sm:[--preview-visible-height:calc(var(--document-preview-height)-var(--space-20))]",
			},
		},
	}),
	page: cva("relative block aspect-page overflow-hidden rounded-sm", {
		variants: { library: { true: "max-sm:h-40 max-sm:w-28 sm:mx-auto sm:w-44" } },
	}),
	typeMarker: "absolute start-2 top-2 z-10",
	previewHeading: "absolute inset-x-0 top-8 z-1 grid gap-1 bg-paper px-3 py-2 text-paper-ink",
	previewName: "line-clamp-2 type-label",
	previewSubtitle: "truncate type-metadata",
	previewImage: "absolute inset-x-0 top-20 w-full object-contain object-top",
	section: "grid gap-3",
	sectionHeading: "flex items-center gap-2 type-section text-ink",
	sections: "grid gap-8",
	identity: "flex min-w-0 items-center gap-2.5",
	mobileType: "flex sm:hidden",
	typeColumn: "w-36 px-2 text-start font-medium max-sm:hidden",
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
	headerRow: "border-b border-line",
	row: "h-16 border-b border-line",
	cell: "py-3 ps-3 pe-2",
};
