// @vitest-environment happy-dom
import type { Resume } from "../builder/draft";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { SaveConflict } from "./save-conflict";

const documents = vi.hoisted(() => ({ local: null as Resume | null, saved: null as Resume | null }));
vi.mock("../builder/draft", () => ({
	useResumeStore: (selector: (state: unknown) => unknown) =>
		selector({ resume: documents.local, resolveConflict: vi.fn() }),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: documents.saved, isPending: false }) }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/libs/orpc/client", () => ({ orpc: { resume: { getById: { queryOptions: () => ({}) } } } }));

beforeEach(() => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	const resume: Resume = {
		id: "synthetic",
		name: "CV",
		slug: "cv",
		tags: [],
		isLocked: false,
		data: structuredClone(defaultResumeData),
		createdAt: new Date(0),
		updatedAt: new Date(1),
	};
	documents.local = resume;
	documents.saved = structuredClone(resume);
});
afterEach(cleanup);

function showDifference(change: (data: ResumeData) => void) {
	if (!documents.local) throw new Error("Missing fixture");
	change(documents.local.data);
	render(
		<I18nProvider i18n={i18n}>
			<SaveConflict />
		</I18nProvider>,
	);
}

it.each([
	[
		"Picture",
		(data: ResumeData) => {
			data.picture.hidden = true;
		},
	],
	[
		"Custom Sections",
		(data: ResumeData) => {
			data.customSections.push({ ...structuredClone(data.sections.experience), id: "custom", type: "experience" });
		},
	],
	[
		"Template",
		(data: ResumeData) => {
			data.metadata.template = "azurill";
		},
	],
	[
		"Layout",
		(data: ResumeData) => {
			data.metadata.layout.sidebarWidth += 1;
		},
	],
	[
		"Page",
		(data: ResumeData) => {
			data.metadata.page.locale = "ar-SA";
		},
	],
	[
		"Design",
		(data: ResumeData) => {
			data.metadata.design.colors.primary = "rgba(0, 0, 0, 1)";
		},
	],
	[
		"Typography",
		(data: ResumeData) => {
			data.metadata.typography.body.fontFamily = "Noto Sans";
		},
	],
	[
		"Notes",
		(data: ResumeData) => {
			data.metadata.notes = "Synthetic private note";
		},
	],
	[
		"Custom Styles",
		(data: ResumeData) => {
			data.metadata.styleRules = [
				{ id: "rule", label: "Synthetic rule", enabled: true, target: { scope: "global" }, slots: {} },
			];
		},
	],
	[
		"Custom Styles",
		(data: ResumeData) => {
			data.metadata.stylesheet = { mode: "semantic", source: { languageVersion: 1, text: ".resume { color: red; }" } };
		},
	],
	[
		"Check",
		(data: ResumeData) => {
			data.metadata.check = { ignored: ["synthetic"], hiddenTerms: [] };
		},
	],
] as const)("shows %s differences on both conflict copies", (label, change) => {
	showDifference(change);
	expect(screen.getAllByText(label, { exact: true })).toHaveLength(2);
	expect(screen.getAllByRole("listitem")).toHaveLength(2);
});

it("shows custom-section removal on both copies", () => {
	if (!documents.saved) throw new Error("Missing fixture");
	documents.saved.data.customSections.push({
		...structuredClone(defaultResumeData.sections.experience),
		id: "removed",
		type: "experience",
	});
	showDifference(() => {});
	expect(screen.getAllByText("Custom Sections", { exact: true })).toHaveLength(2);
});

it("shows custom-section ordering changes without inventing changed built-in sections", () => {
	if (!documents.local || !documents.saved) throw new Error("Missing fixture");
	const section = { ...structuredClone(defaultResumeData.sections.experience), type: "experience" as const };
	documents.saved.data.customSections = [
		{ ...section, id: "first" },
		{ ...section, id: "second" },
	];
	documents.local.data.customSections = structuredClone(documents.saved.data.customSections);
	showDifference((data) => {
		data.customSections.reverse();
	});
	expect(screen.getAllByText("Custom Sections", { exact: true })).toHaveLength(2);
	expect(screen.getAllByRole("listitem")).toHaveLength(2);
});

it("keeps built-in section and summary differences visible", () => {
	showDifference((data) => {
		data.sections.experience.title = "Work";
		data.summary.content = "Synthetic summary";
	});
	expect(screen.getByText("Work", { exact: true })).toBeVisible();
	expect(screen.getByText("Experience", { exact: true })).toBeVisible();
	expect(screen.getAllByText("Summary", { exact: true })).toHaveLength(2);
});

it("does not invent difference rows for identical copies", () => {
	showDifference(() => {});
	expect(screen.queryAllByRole("listitem")).toHaveLength(0);
});
