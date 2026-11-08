import z from "zod";

export const templateSchema = z.enum([
	"azurill",
	"bronzor",
	"chikorita",
	"ditgar",
	"ditto",
	"gengar",
	"glalie",
	"kakuna",
	"lapras",
	"leafish",
	"meowth",
	"onyx",
	"persian",
	"pikachu",
	"porygon",
	"rhyhorn",
	"scizor",
	"smeargle",
]);

export type Template = z.infer<typeof templateSchema>;

/**
 * Round 9 conditional beta diagnostic subset (2026-11-07); report8.md records
 * all suites and the documented content limitations. Round 5 matrix support:
 * tooling/document-qualification/fixtures/regressions/round5-template-support.json.
 * This is not an unconditional v2 pass, Arabic launch approval or universal ATS
 * certification. Marked text, raw dates and two-column mixed skills remain
 * limited. T004 owns any UI exposure; human Arabic acceptance is pending.
 */
export const arabicMixedDiagnosticTemplates = [
	"azurill",
	"bronzor",
	"chikorita",
	"ditgar",
	"ditto",
	"gengar",
	"glalie",
	"lapras",
	"leafish",
	"onyx",
	"pikachu",
	"porygon",
	"rhyhorn",
	"scizor",
] as const satisfies readonly Template[];

/** How a template lays out the page. The single source for the gallery filters, the Check layout rule and DOCX. */
export type TemplateLayout = {
	/** Two-column templates print the sidebar as a column of its own; one-column templates read top to bottom. */
	columns: 1 | 2;
	/** Where the sidebar column sits by default. Null for one-column templates. */
	sidebarSide: "left" | "right" | null;
	/** Where the header sits: across the page, over the main column only, or in the sidebar. */
	headerPlacement: "full-width" | "main-only" | "sidebar-only";
	/** One reading order and plain text headings, which applicant tracking systems read cleanly. */
	atsSafe: boolean;
};

const oneColumn: TemplateLayout = { columns: 1, sidebarSide: null, headerPlacement: "full-width", atsSafe: true };

export const templateLayouts = {
	azurill: { columns: 2, sidebarSide: "left", headerPlacement: "full-width", atsSafe: false },
	// Bronzor prints sidebar sections as labelled rows inside one column.
	bronzor: oneColumn,
	chikorita: { columns: 2, sidebarSide: "right", headerPlacement: "main-only", atsSafe: false },
	ditgar: { columns: 2, sidebarSide: "left", headerPlacement: "sidebar-only", atsSafe: false },
	ditto: { columns: 2, sidebarSide: "left", headerPlacement: "full-width", atsSafe: false },
	gengar: { columns: 2, sidebarSide: "left", headerPlacement: "sidebar-only", atsSafe: false },
	glalie: { columns: 2, sidebarSide: "left", headerPlacement: "sidebar-only", atsSafe: false },
	kakuna: oneColumn,
	lapras: oneColumn,
	leafish: { columns: 2, sidebarSide: "right", headerPlacement: "full-width", atsSafe: false },
	meowth: oneColumn,
	onyx: oneColumn,
	persian: oneColumn,
	pikachu: { columns: 2, sidebarSide: "left", headerPlacement: "main-only", atsSafe: false },
	porygon: oneColumn,
	rhyhorn: oneColumn,
	scizor: oneColumn,
	smeargle: oneColumn,
} as const satisfies Record<Template, TemplateLayout>;
