// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { useEditorStore } from "../store";
import { CheckPanel } from "./check-panel";

const documentState = vi.hoisted(() => ({
	locale: "en-US",
	pdfState: "not-checked",
	findings: false,
	ignored: [] as string[],
	locked: false,
	fixable: false,
	checkedAt: "2026-11-12T10:00:00.000Z",
	startFix: vi.fn(),
	ignorePdf: vi.fn(),
	restoreIgnored: vi.fn(),
}));

vi.mock("@/features/resume/builder/draft", async () => {
	const { defaultResumeData } = await import("@reactive-resume/schema/resume/default");
	const data = () => ({
		...defaultResumeData,
		basics: {
			...defaultResumeData.basics,
			website: { ...defaultResumeData.basics.website, url: documentState.fixable ? "example.test" : "" },
		},
		metadata: {
			...defaultResumeData.metadata,
			page: { ...defaultResumeData.metadata.page, locale: documentState.locale },
			check: { ignored: documentState.ignored, hiddenTerms: [] },
		},
	});
	return {
		useResumeData: data,
		useIsResumeLocked: () => documentState.locked,
		useResumeStore: { getState: () => ({ resume: documentState.fixable ? { data: data() } : null }) },
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
	}),
	editWithUndo: vi.fn(),
}));
vi.mock("./writing-tab", () => ({ WritingTab: () => null }));

beforeEach(() => {
	useEditorStore.getState().reset();
	documentState.locale = "en-US";
	documentState.pdfState = "not-checked";
	documentState.findings = false;
	documentState.ignored = [];
	documentState.locked = false;
	documentState.fixable = false;
	documentState.checkedAt = "2026-11-12T10:00:00.000Z";
	documentState.startFix.mockReset();
	documentState.restoreIgnored.mockReset();
	documentState.ignorePdf.mockReset();
	i18n.load("en", {});
	i18n.activate("en");
});
afterEach(cleanup);

const panel = () =>
	render(
		<I18nProvider i18n={i18n}>
			<CheckPanel />
		</I18nProvider>,
	);

it("places the page-view switch beside the Check heading and toggles the shared canvas state", async () => {
	panel();
	const heading = screen.getByRole("heading", { name: "Review your CV" });
	const group = screen.getByRole("radiogroup", { name: "Page view" });
	expect(heading.parentElement).toContainElement(group);
	const person = within(group).getByRole("radio", { name: "What a person sees" });
	const parser = within(group).getByRole("radio", { name: "What a parser reads" });
	expect(person).toHaveAttribute("aria-checked", "true");
	await userEvent.click(parser);
	expect(useEditorStore.getState().pageView).toBe("parser");
	expect(parser).toHaveAttribute("aria-checked", "true");
	expect(person).toHaveAttribute("aria-checked", "false");
	await userEvent.click(person);
	expect(useEditorStore.getState().pageView).toBe("page");
});

it("supports keyboard selection with the existing accessible option names", async () => {
	panel();
	await userEvent.click(screen.getByRole("radio", { name: "What a person sees" }));
	await userEvent.keyboard("{ArrowRight}");
	expect(screen.getByRole("radio", { name: "What a parser reads" })).toHaveFocus();
	expect(useEditorStore.getState().pageView).toBe("parser");
	await userEvent.keyboard("{ArrowLeft}");
	expect(useEditorStore.getState().pageView).toBe("page");
});

it("preserves the selected view when mobile navigation unmounts and reopens the Check panel", async () => {
	useEditorStore.getState().setMobileView("check");
	const view = panel();
	await userEvent.click(screen.getByRole("radio", { name: "What a parser reads" }));
	expect(useEditorStore.getState().mobileView).toBe("check");
	view.unmount();
	act(() => useEditorStore.getState().setMobileView("page"));
	expect(useEditorStore.getState().pageView).toBe("parser");
	act(() => useEditorStore.getState().setMobileView("check"));
	panel();
	expect(screen.getByRole("radio", { name: "What a parser reads" })).toHaveAttribute("aria-checked", "true");
	await userEvent.click(screen.getByRole("radio", { name: "What a person sees" }));
	expect(useEditorStore.getState().pageView).toBe("page");
});

it.each(["failed", "partial"])("gives %s checks a titled recovery notice", (state) => {
	documentState.pdfState = state;
	panel();
	const notice = document.querySelector('[data-slot="alert"]') as HTMLElement;
	expect(notice).toHaveClass(state === "failed" ? "bg-danger-soft" : "bg-warn-soft");
	expect(notice.querySelector('[data-slot="alert-title"]')).toHaveTextContent(
		state === "failed" ? "Check failed" : "Partially checked",
	);
	expect(within(notice).getByRole("button", { name: "Check the PDF again" })).toBeEnabled();
});

it("reveals extracted text outside the tablet drawer", async () => {
	documentState.pdfState = "complete";
	documentState.findings = true;
	useEditorStore.getState().setDrawerOpen(true);
	panel();
	await userEvent.click(screen.getByRole("button", { name: "Review extracted text" }));
	expect(useEditorStore.getState().drawerOpen).toBe(false);
	expect(useEditorStore.getState().pageView).toBe("parser");
	expect(useEditorStore.getState().mobileView).toBe("page");
});

it("offers a counted recovery action for notes ignored in the saved document", async () => {
	documentState.ignored = ["MISSING_EMAIL:/basics/email", "MISSING_PHONE:/basics/phone"];
	panel();
	const writing = screen.getByRole("region", { name: "Writing and content" });
	const restore = within(writing).getByRole("button", { name: "Show again (2)" });
	await userEvent.click(restore);
	expect(documentState.restoreIgnored).toHaveBeenCalledOnce();
});
it("does not offer restoration without ignored notes", () => {
	panel();
	expect(screen.queryByRole("button", { name: /^Show again/ })).not.toBeInTheDocument();
});
it("disables restoring ignored notes in a locked document", () => {
	documentState.ignored = ["MISSING_EMAIL:/basics/email"];
	documentState.locked = true;
	panel();
	expect(screen.getByRole("button", { name: "Show again (1)" })).toBeDisabled();
});

it("summarizes separate dimensions and hides tips until expanded", async () => {
	documentState.pdfState = "complete";
	documentState.findings = true;
	panel();
	expect(screen.getByRole("region", { name: "Check summary" })).toHaveTextContent("PDF readability");
	expect(screen.getByRole("button", { name: /Blocker.*1/ })).toHaveAttribute("aria-expanded", "true");
	const tips = screen.getAllByRole("button", { name: /Tip/ });
	expect(tips.length).toBeGreaterThan(0);
	for (const tip of tips) expect(tip).toHaveAttribute("aria-expanded", "false");
});
it.each(["stale", "checking", "not-checked", "skipped"])(
	"explains %s without presenting old findings as current",
	(state) => {
		documentState.pdfState = state;
		documentState.findings = true;
		panel();
		expect(screen.queryByText("Export a PDF with selectable text")).not.toBeInTheDocument();
		if (state === "stale") expect(screen.getByText("Result out of date")).toBeVisible();
		if (state === "checking") expect(document.querySelector('[data-slot="spinner"]')).toBeInTheDocument();
		if (state === "not-checked" || state === "skipped")
			expect(screen.getByText("Add information to your CV to check its PDF readability.")).toBeVisible();
	},
);
it("explains the lock once and disables document-changing actions", () => {
	documentState.locked = true;
	panel();
	expect(screen.getByText("This CV is locked")).toBeVisible();
	expect(
		screen.getByText("Unlock the CV to apply fixes or change kept findings. You can still read the results."),
	).toBeVisible();
});

it("keeps PDF warnings separately from blockers, restores their saved keys, and collapses kept findings", async () => {
	documentState.pdfState = "complete";
	documentState.findings = true;
	const view = panel();
	const pdf = screen.getByRole("region", { name: "PDF readability" });
	await userEvent.click(within(pdf).getByRole("button", { name: "Keep as is" }));
	expect(documentState.ignorePdf).toHaveBeenCalledWith("pdf:NO_EMAIL:1:Contact");
	documentState.ignored = ["pdf:NO_EMAIL:1:Contact"];
	view.rerender(
		<I18nProvider i18n={i18n}>
			<CheckPanel />
		</I18nProvider>,
	);
	expect(within(pdf).queryByRole("button", { name: "Keep as is" })).not.toBeInTheDocument();
	expect(screen.getByRole("button", { name: "1 kept as is" })).toHaveAttribute("aria-expanded", "false");
	await userEvent.click(screen.getByRole("button", { name: "Show again (1)" }));
	expect(documentState.restoreIgnored).toHaveBeenCalledOnce();
	expect(within(pdf).getByRole("button", { name: /Blocker.*1/ })).toBeVisible();
});

it("keeps review navigation available but disables PDF keep actions for a locked CV", () => {
	documentState.locked = true;
	documentState.findings = true;
	documentState.pdfState = "complete";
	panel();
	const pdf = screen.getByRole("region", { name: "PDF readability" });
	expect(within(pdf).getByRole("button", { name: "Keep as is" })).toBeDisabled();
	expect(within(pdf).getByRole("button", { name: "Go to field" })).toBeDisabled();
	expect(within(pdf).getByRole("button", { name: "Review extracted text" })).toBeEnabled();
});

it("shows an accepted fix in the collapsed fixed group until the checked result changes", async () => {
	documentState.fixable = true;
	const { useResumeStore } = await import("@/features/resume/builder/draft");
	const { prepareFix } = await import("./fix-preview");
	const identity = { ownerId: "alice", resumeId: "cv", baseRevision: "1", editGeneration: 0 };
	useEditorStore.getState().setIdentity(identity);
	documentState.startFix.mockImplementation((issue) => {
		const resume = useResumeStore.getState().resume;
		if (!resume) throw new Error("Expected a synthetic CV");
		const data = resume.data;
		useEditorStore.getState().setCheckFixPreview(prepareFix(identity, data, issue.fix.apply));
	});
	const view = panel();
	await userEvent.click(screen.getByRole("button", { name: "Fix" }));
	await userEvent.click(screen.getByRole("button", { name: "Accept change" }));
	expect(screen.getByRole("button", { name: "0 kept as is · 1 fixed" })).toHaveAttribute("aria-expanded", "false");
	documentState.pdfState = "checking";
	documentState.checkedAt = "";
	view.rerender(
		<I18nProvider i18n={i18n}>
			<CheckPanel />
		</I18nProvider>,
	);
	expect(screen.getByRole("button", { name: "0 kept as is · 1 fixed" })).toBeVisible();
	documentState.pdfState = "complete";
	documentState.checkedAt = "2026-11-12T10:01:00.000Z";
	view.rerender(
		<I18nProvider i18n={i18n}>
			<CheckPanel />
		</I18nProvider>,
	);
	expect(screen.queryByRole("button", { name: /1 fixed/ })).not.toBeInTheDocument();
});
