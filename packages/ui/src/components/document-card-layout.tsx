import { cva } from "class-variance-authority";

/** The loaded card and its placeholder share one responsive layout contract. */
export const documentCardLayout = {
	surface: cva(
		"group/card relative flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-surface p-3 transition-colors duration-quick hover:border-line-2 has-focus-visible:ring-2 has-focus-visible:ring-accent sm:p-4",
		{
			variants: { library: { true: "" } },
		},
	),
	cue: "flex min-w-0 items-center gap-2.5 pe-12",
	iconTile:
		"grid size-9 shrink-0 place-items-center rounded-lg bg-sunken text-ink-2 [background-color:color-mix(in_srgb,var(--document-accent,var(--sunken))_12%,var(--surface))]",
	title: "min-w-0 type-label text-ink",
	titleLink:
		"line-clamp-2 text-start wrap-anywhere outline-none after:absolute after:inset-0 after:z-1 after:rounded-xl",
	metadata: "flex flex-wrap items-center gap-1",
	application: "grid min-w-0 gap-0.5 type-metadata text-ink-2",
	applicationName: "line-clamp-2 wrap-anywhere",
	stage: "inline-flex items-center gap-1 text-ink-3",
	stageDot: "size-1.5 shrink-0 rounded-full",
	date: "relative z-10 mt-auto w-fit pe-8 type-metadata text-ink-3",
	controls: "absolute end-2 top-2 z-10",
	selection: "absolute end-3 bottom-3 z-10",
	indicators: "flex flex-wrap items-center gap-1",
	section: "grid gap-3",
	sectionHeading: "flex items-center gap-2 type-section text-ink",
	sections: "grid gap-8 [&>section+section]:border-t [&>section+section]:border-line [&>section+section]:pt-8",
	identity: "flex min-w-0 items-center gap-2.5",
	typeColumn: "w-36 px-2 text-start type-metadata text-ink-2 max-sm:w-20",
	rowTitle: "min-w-0 line-clamp-2 text-start type-body font-semibold wrap-anywhere hover:underline max-sm:min-h-[2lh]",
	rowMetadata: "mt-1 grid min-w-0 gap-1",
	mobileDetails: "grid gap-1 type-metadata text-ink-3 sm:hidden",
	applicationCell: "px-2 type-body text-ink-2 max-sm:hidden",
	editedCell: "px-2 type-body whitespace-nowrap text-ink-3 max-sm:hidden",
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
