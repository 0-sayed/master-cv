// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { cleanup, render, screen, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { useEditorStore } from "../store";
vi.mock("./job-match", () => ({
	JobMatchTab: () => <a href="/dashboard/resumes/synthetic/job">Compare with a job</a>,
}));
import { useResumeStore } from "../../builder/draft";
import { editWithUndo } from "./actions";
import { prepareFix } from "./fix-preview";
import { ReviewFindings } from "./review-findings";
import { getUiLocaleMessages } from "@/libs/locale";

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		to,
		hash,
		search,
		children,
		...props
	}: {
		to: string;
		hash?: string;
		search?: { locale?: string };
		children: ReactNode;
	}) => (
		<a href={`${to}?locale=${search?.locale}#${hash}`} {...props}>
			{children}
		</a>
	),
}));

const documentState = vi.hoisted(() => ({
	locale: "en-US",
	pdfState: "not-checked",
	findings: false,
	missingHeading: false,
	ignored: [] as string[],
	locked: false,
	fixable: false,
	headings: 0,
	photo: false,
	checkedAt: "2026-11-12T10:00:00.000Z",
	startFix: vi.fn(),
	ignorePdf: vi.fn(),
	restoreIgnored: vi.fn(),
	showPdf: vi.fn(),
	showWriting: vi.fn(),
}));

vi.mock("@/features/resume/builder/draft", async () => {
	const { defaultResumeData } = await import("@reactive-resume/schema/resume/default");
	const data = () => ({
		...defaultResumeData,
		picture: {
			...defaultResumeData.picture,
			hidden: false,
			url: documentState.photo ? "/templates/photos/synthetic.webp" : "",
		},
		customSections: Array.from({ length: documentState.headings }, (_, index) => ({
			...defaultResumeData.sections.experience,
			id: `section${index}`,
			type: "summary",
			title: `قسم إضافي ${index + 1}`,
			items: [{ id: `item${index}`, hidden: false, content: "خطة التطوير المهني" }],
		})),
		basics: {
			...defaultResumeData.basics,
			website: { ...defaultResumeData.basics.website, url: documentState.fixable ? "example.test" : "" },
		},
		metadata: {
			...defaultResumeData.metadata,
			page: { ...defaultResumeData.metadata.page, locale: documentState.locale },
			layout: {
				...defaultResumeData.metadata.layout,
				pages: [
					{
						fullWidth: true,
						main: Array.from({ length: documentState.headings }, (_, index) => `section${index}`),
						sidebar: [],
					},
				],
			},
			check: { ignored: documentState.ignored, hiddenTerms: [] },
		},
	});
	return {
		useResumeData: data,
		useIsResumeLocked: () => documentState.locked,
		useResumeStore: {
			getState: () => ({
				resume: documentState.fixable || documentState.headings || documentState.photo ? { data: data() } : null,
			}),
		},
	};
});
vi.mock("./use-readiness", async () => {
	const { emptyReadiness } = await import("@reactive-resume/resume/ats");
	return {
		useReadiness: () => ({
			results: {
				pdf: { ...emptyReadiness("pdf"), state: documentState.pdfState, checkedAt: documentState.checkedAt },
				writing: emptyReadiness("writing"),
				job: emptyReadiness("job"),
			},
			pdfReport: documentState.findings
				? {
						findings: [
							{ code: "NO_TEXT_LAYER", severity: "blocker", evidence: { page: 1 } },
							{ code: "NO_EMAIL", severity: "warning", evidence: { page: 1, snippet: "Contact" } },
							...(documentState.missingHeading ? [{ code: "NO_EXPERIENCE_SECTION", severity: "warning" }] : []),
						],
						tips: [{ code: "NO_SUMMARY_SECTION", severity: "tip" }],
					}
				: null,
			requestRetry: vi.fn(),
			introduced: true,
			setIntroduced: vi.fn(),
		}),
	};
});
vi.mock("./actions", () => ({
	useCheckActions: () => ({
		restoreIgnored: documentState.restoreIgnored,
		ignorePdf: documentState.ignorePdf,
		fix: documentState.startFix,
		showPdfOnPage: (finding: { code: string; evidence?: { page?: number; snippet?: string } }) => {
			documentState.showPdf(finding);
			useEditorStore
				.getState()
				.setCheckIssue(`pdf:${finding.code}:${finding.evidence?.page ?? ""}:${finding.evidence?.snippet ?? ""}`);
		},
		showOnPage: documentState.showWriting,
	}),
	editWithUndo: vi.fn(),
}));
vi.mock("./writing-tab", () => ({ WritingTab: () => null }));

beforeEach(() => {
	useEditorStore.getState().reset();
	documentState.locale = "en-US";
	documentState.pdfState = "not-checked";
	documentState.findings = false;
	documentState.missingHeading = false;
	documentState.ignored = [];
	documentState.locked = false;
	documentState.fixable = false;
	documentState.headings = 0;
	documentState.photo = false;
	documentState.checkedAt = "2026-11-12T10:00:00.000Z";
	vi.mocked(editWithUndo).mockClear();
	documentState.startFix.mockReset();
	documentState.restoreIgnored.mockReset();
	documentState.ignorePdf.mockReset();
	i18n.load("en", {});
	i18n.activate("en");
});
afterEach(cleanup);

const panel = (tab: "ats" | "writing" = "ats") =>
	render(
		<I18nProvider i18n={i18n}>
			<ReviewFindings tab={tab} />
		</I18nProvider>,
	);

it("shows human photo states and a thumbnail in the card and the same diff in the Fix dialog", async () => {
	documentState.photo = true;
	i18n.loadAndActivate(await getUiLocaleMessages("ar-SA"));
	const identity = { ownerId: "owner", resumeId: "cv", baseRevision: "revision", editGeneration: 0 };
	useEditorStore.getState().setIdentity(identity);
	documentState.startFix.mockImplementation((issue) => {
		const data = useResumeStore.getState().resume?.data;
		if (data && issue.fix.kind === "apply")
			useEditorStore.getState().setCheckFixPreview(prepareFix(identity, data, issue.fix.apply));
	});
	panel("writing");
	const card = screen.getByRole("heading", { name: "راجع مدى الحاجة إلى صورتك" }).closest("[data-finding-card]");
	if (!(card instanceof HTMLElement)) throw new Error("Expected photo card");
	expect(card.querySelector(".rule-comparison-value del")).toHaveTextContent("ظاهرة");
	expect(card.querySelector(".rule-comparison-value ins")).toHaveTextContent("مخفية");
	expect(card.querySelector("img")).toHaveAttribute("src", "/templates/photos/synthetic.webp");
	expect(card.querySelector(".rule-comparison-value")).toHaveAttribute("data-layout", "inline");
	const hint = /القسم إذا تعذّر تحديد النص بدقة/;
	expect(card.textContent).not.toMatch(hint);
	expect(within(card).getByRole("button", { name: hint })).toBeVisible();
	expect(card.textContent).not.toMatch(/\b(?:true|false)\b/);
	await userEvent.click(within(card).getByRole("button", { name: "إصلاح" }));
	const dialog = screen.getByRole("dialog");
	expect(dialog.querySelector(".rule-comparison-value del")).toHaveTextContent("ظاهرة");
	expect(dialog.querySelector(".rule-comparison-value ins")).toHaveTextContent("مخفية");
	expect(dialog.querySelector("img")).toHaveAttribute("src", "/templates/photos/synthetic.webp");
	expect(dialog.querySelector(".rule-comparison-value")).toHaveAttribute("data-layout", "inline");
	expect(dialog.textContent).not.toMatch(/\b(?:true|false)\b/);
	expect(editWithUndo).not.toHaveBeenCalled();
});

it("shows repair actions, guide links, and one selected card", async () => {
	documentState.pdfState = "complete";
	documentState.findings = true;
	panel();
	expect(screen.getAllByRole("link", { name: "Learn more about this check" })).toHaveLength(3);
	const card = screen.getByRole("heading", { name: "Export a PDF with selectable text" }).closest("[data-issue-card]");
	if (!(card instanceof HTMLElement)) throw new Error("Missing finding card");
	await userEvent.click(within(card).getByRole("button", { name: "Show location" }));
	expect(documentState.showPdf).toHaveBeenCalled();
	expect(document.querySelectorAll('[data-selected="true"]')).toHaveLength(1);
	expect(screen.getAllByRole("button", { name: "Keep as is" })[0]).toBeEnabled();
});

it("keeps the explanation with the finding and help with its actions in reading order", () => {
	documentState.pdfState = "complete";
	documentState.findings = true;
	panel();
	const card = screen
		.getByRole("heading", { name: "Export a PDF with selectable text" })
		.closest("[data-slot=section-card]");
	const summary = card?.querySelector("[data-slot=finding-summary]");
	const actions = card?.querySelector("[data-finding-actions]");
	expect(summary?.querySelector("[data-slot=rule-detail]")).toBeTruthy();
	expect(actions?.querySelector("a")).toHaveAccessibleName("Learn more about this check");
	expect(summary?.nextElementSibling).toBe(actions);
	expect(actions?.querySelector("[data-slot=rule-detail]")).toBeNull();
});
it("filters real findings and distinguishes a filtered empty result", async () => {
	documentState.pdfState = "complete";
	documentState.findings = true;
	panel();
	act(() => useEditorStore.getState().setReviewFilter("ats", "warning"));
	expect(screen.queryByRole("heading", { name: "Export a PDF with selectable text" })).not.toBeInTheDocument();
	expect(screen.getAllByRole("link", { name: "Learn more about this check" })).toHaveLength(1);
	documentState.findings = false;
	cleanup();
	panel();
	expect(screen.getByText("No findings match this filter.")).toBeVisible();
	await userEvent.click(screen.getByRole("button", { name: "Show all findings" }));
	expect(useEditorStore.getState().reviewFilters.ats).toBe("all");
});
it.each(["stale", "failed", "checking", "skipped"])("suppresses cached findings for %s", (state) => {
	documentState.pdfState = state;
	documentState.findings = true;
	panel();
	expect(screen.queryByRole("link", { name: "Learn more about this check" })).not.toBeInTheDocument();
	if (state === "failed") expect(screen.getByRole("button", { name: "Check the PDF again" })).toBeEnabled();
});
it("keeps PDF warnings with saved keys while blockers remain non-dismissible", async () => {
	documentState.pdfState = "complete";
	documentState.findings = true;
	panel();
	expect(screen.getAllByRole("button", { name: "Keep as is" })).toHaveLength(2);
	const [keep] = screen.getAllByRole("button", { name: "Keep as is" });
	if (!keep) throw new Error("Missing Keep as is action");
	await userEvent.click(keep);
	expect(documentState.ignorePdf).toHaveBeenCalledWith("pdf:NO_EMAIL:1:Contact");
});
it("disables document changes when locked but leaves review navigation available", () => {
	documentState.locked = true;
	documentState.pdfState = "complete";
	documentState.findings = true;
	panel();
	expect(screen.getAllByRole("button", { name: "Keep as is" })[0]).toBeDisabled();
	expect(screen.getAllByRole("button", { name: "Show location" })[0]).toBeEnabled();
});
it("does not offer a page location for a missing experience heading", () => {
	documentState.pdfState = "complete";
	documentState.findings = true;
	documentState.missingHeading = true;
	panel();
	const card = screen.getByRole("heading", { name: "Add a clear experience heading" }).closest("[data-issue-card]");
	if (!(card instanceof HTMLElement)) throw new Error("Missing finding card");
	expect(within(card).queryByRole("button", { name: "Show location" })).not.toBeInTheDocument();
});
it.each(["ats", "writing"] as const)("restores saved ignored findings from %s", async (tab) => {
	documentState.ignored = [tab === "ats" ? "pdf:NO_EMAIL:document:" : "MISSING_EMAIL:/basics/email"];
	panel(tab);
	await userEvent.click(screen.getByRole("button", { name: "Show again (1)" }));
	expect(documentState.restoreIgnored).toHaveBeenCalledOnce();
});

it.each(["ar-SA", "en-US"] as const)("localizes filters, guidance, and the real guide link in %s", async (locale) => {
	documentState.pdfState = "complete";
	documentState.findings = true;
	i18n.loadAndActivate(await getUiLocaleMessages(locale));
	render(
		<I18nProvider i18n={i18n}>
			<ReviewFindings tab="ats" />
		</I18nProvider>,
	);
	const help = screen.getAllByRole("button", {
		name: locale === "ar-SA" ? "لماذا يهم" : "Why it matters",
	})[0];
	if (!help) throw new Error("Expected a finding explanation");
	await userEvent.click(help);
	expect(help).toHaveAttribute("aria-expanded", "true");
	expect(
		screen.getAllByRole("link", { name: locale === "ar-SA" ? "تعرّف على هذا الفحص" : "Learn more about this check" })[0],
	).toHaveAttribute("href", expect.stringContaining("#rule-"));
	expect(documentState.locale).toBe("en-US");
});
it("applies an automatic repair only after explicit confirmation and preserves Cancel", async () => {
	documentState.fixable = true;
	const identity = { ownerId: "owner", resumeId: "cv", baseRevision: "revision", editGeneration: 1 };
	useEditorStore.getState().setIdentity(identity);
	documentState.startFix.mockImplementation((issue) => {
		const data = useResumeStore.getState().resume?.data;
		if (data && issue.fix.kind === "apply")
			useEditorStore.getState().setCheckFixPreview(prepareFix(identity, data, issue.fix.apply));
	});
	render(
		<I18nProvider i18n={i18n}>
			<ReviewFindings tab="writing" />
		</I18nProvider>,
	);
	expect(screen.getAllByRole("button", { name: "Why it matters" })[0]).toHaveAttribute("aria-expanded", "false");
	const fix = screen.getAllByRole("button", { name: "Fix" })[0];
	if (!fix) throw new Error("Expected an automatic repair");
	expect(fix.closest('[data-slot="accordion-content"]')).toBeNull();
	const row = fix.closest('[data-slot="action-group"]');
	expect(row?.querySelector('button[data-variant="primary"]')).toBe(fix);
	expect(row?.querySelector('a[aria-label="Learn more about this check"]')).not.toBeNull();
	await userEvent.click(fix);
	expect(screen.getByRole("dialog")).toBeVisible();
	expect(editWithUndo).not.toHaveBeenCalled();
	await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
	expect(editWithUndo).not.toHaveBeenCalled();
	await userEvent.click(fix);
	await userEvent.click(screen.getByRole("button", { name: "Accept change" }));
	expect(editWithUndo).toHaveBeenCalledTimes(1);
});

it.each(["ar-SA", "en-US"] as const)(
	"groups thirteen real headings and confirms editable Fix all in %s",
	async (locale) => {
		documentState.headings = 13;
		documentState.locale = "ar-SA";
		i18n.loadAndActivate(await getUiLocaleMessages(locale));
		const identity = { ownerId: "owner", resumeId: "cv", baseRevision: "revision", editGeneration: 0 };
		useEditorStore.getState().setIdentity(identity);
		panel("writing");
		const group = document.querySelector('[data-finding-group="NON_STANDARD_SECTION_TITLE"]');
		expect(group).toBeTruthy();
		expect(group?.querySelector("summary")).toHaveTextContent(
			locale === "ar-SA" ? "13 قسمًا بعناوين غير مألوفة" : "13 sections use unfamiliar headings",
		);
		const summary = group?.querySelector("summary");
		if (!summary) throw new Error("Expected a group summary");
		await userEvent.click(summary);
		expect(group?.querySelectorAll("[data-issue-card]")).toHaveLength(13);
		expect(group).toHaveTextContent("قسم إضافي 1");
		expect(group).not.toHaveTextContent("رحلتي");
		const current = useResumeStore.getState().resume;
		if (!current) throw new Error("Expected a CV");
		const data = structuredClone(current.data);
		await userEvent.click(screen.getByRole("button", { name: locale === "ar-SA" ? "إصلاح الكل" : "Fix all" }));
		expect(screen.getByRole("dialog")).toBeVisible();
		expect(screen.getByRole("dialog").querySelectorAll('[data-slot="rule-comparison"]')).toHaveLength(13);
		expect(screen.getAllByRole("combobox")).toHaveLength(13);
		expect(editWithUndo).not.toHaveBeenCalled();
		const [select] = screen.getAllByRole("combobox");
		if (!select) throw new Error("Expected heading choices");
		await userEvent.selectOptions(select, "المهارات");
		await userEvent.click(screen.getByRole("button", { name: locale === "ar-SA" ? "قبول التغيير" : "Accept change" }));
		const apply = vi.mocked(editWithUndo).mock.calls.at(-1)?.[0];
		expect(apply).toBeDefined();
		if (!apply) throw new Error("Expected a confirmed change");
		apply(data);
		expect(data.customSections[0]?.title).toBe("المهارات");
		expect(data.customSections.every((section) => section.title.trim())).toBe(true);
		expect(data.customSections[0]?.items[0]).toEqual({ id: "item0", hidden: false, content: "خطة التطوير المهني" });
	},
);

it("disables acceptance for an empty heading even when a preview comes from another caller", () => {
	const identity = { ownerId: "owner", resumeId: "cv", baseRevision: "revision", editGeneration: 0 };
	documentState.headings = 1;
	const data = useResumeStore.getState().resume?.data;
	if (!data) throw new Error("Expected a CV");
	const preview = prepareFix(identity, data, (draft) => {
		const section = draft.customSections[0];
		if (section) section.title = "";
	});
	useEditorStore.getState().setIdentity(identity);
	useEditorStore.getState().setCheckFixPreview(preview);
	panel("writing");
	expect(screen.getByRole("button", { name: "Accept change" })).toBeDisabled();
	expect(editWithUndo).not.toHaveBeenCalled();
});
