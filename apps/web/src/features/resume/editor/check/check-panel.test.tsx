// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { useEditorStore } from "../store";
vi.mock("./job-match", () => ({
	JobComparisonLink: () => <a href="/dashboard/resumes/synthetic/job">Compare with a job</a>,
}));
import { CheckPanel } from "./check-panel";
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
	ignored: [] as string[],
	locked: false,
	fixable: false,
	aiCount: undefined as number | null | undefined,
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
		showPdfOnPage: vi.fn(),
	}),
	editWithUndo: vi.fn(),
}));
vi.mock("./writing-tab", () => ({ WritingTab: () => <p>AI approval controls</p> }));
vi.mock("../proposals/review-panel", () => ({
	useResumeReviewSummary: () => ({ state: "off", pendingCount: documentState.aiCount }),
}));

beforeEach(() => {
	useEditorStore.getState().reset();
	documentState.locale = "en-US";
	documentState.pdfState = "not-checked";
	documentState.findings = false;
	documentState.ignored = [];
	documentState.locked = false;
	documentState.fixable = false;
	documentState.aiCount = undefined;
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

it.each([undefined, null])("keeps the unavailable AI tab label without a visible count bubble (%s)", (count) => {
	documentState.aiCount = count;
	panel();
	const tab = screen.getByRole("tab", { name: /AI.*AI unavailable/ });
	expect(tab).toHaveTextContent("AI");
	expect(tab).not.toHaveTextContent("Off");
	expect(tab.querySelector('[data-slot="tabs-count"]')).toBeNull();
});

it("preserves a real zero AI count", () => {
	documentState.aiCount = 0;
	panel();
	const tab = screen.getByRole("tab", { name: "AI 0" });
	expect(tab.querySelector('[data-slot="tabs-count"]')).toHaveTextContent("0");
});

it("opens findings immediately with counts, one severity control, and no summary step", async () => {
	documentState.pdfState = "complete";
	documentState.findings = true;
	panel();
	expect(screen.queryByRole("button", { name: "Open full review" })).toBeNull();
	expect(screen.getByRole("tab", { name: "ATS check 3" })).toBeVisible();
	expect(screen.getAllByRole("tab")).toHaveLength(3);
	expect(screen.getAllByRole("radiogroup", { name: "Severity filter" })).toHaveLength(1);
	expect(screen.getByRole("heading", { name: "Export a PDF with selectable text" })).toBeVisible();
	expect(screen.getByRole("link", { name: "Compare with a job" })).toBeVisible();
	await userEvent.click(screen.getByRole("radio", { name: "Warning 1" }));
	expect(screen.queryByRole("heading", { name: "Export a PDF with selectable text" })).toBeNull();
});
it.each(["stale", "checking", "failed"])("does not show old counts while %s", (state) => {
	documentState.pdfState = state;
	documentState.findings = true;
	panel();
	expect(screen.queryByText(/Blocker \(1\)/)).not.toBeInTheDocument();
	const tab = screen.getByRole("tab", { name: /ATS check/ });
	expect(tab.textContent).not.toMatch(/[–—-]/);
	if (state === "checking") expect(tab).toHaveAttribute("aria-busy", "true");
});

it.each(["ar-SA", "en-US"] as const)(
	"localizes the findings without changing document language: %s",
	async (locale) => {
		documentState.locale = "en-US";
		i18n.loadAndActivate(await getUiLocaleMessages(locale));
		panel();
		expect(screen.getByRole("link", { name: locale === "ar-SA" ? "دليل المراجعة" : "Review guide" })).toHaveAttribute(
			"href",
			`/dashboard/review-guide?locale=${locale}#undefined`,
		);
		expect(screen.getByRole("tab", { name: locale === "ar-SA" ? "فحص ATS" : "ATS check" })).toBeVisible();
		expect(screen.getByRole("tab", { name: locale === "ar-SA" ? /الذكاء الاصطناعي/ : /AI/ })).toBeVisible();
		expect(screen.getByRole("tab", { name: locale === "ar-SA" ? /^فحص البيانات/ : /^Data check/ })).toBeVisible();
		expect(screen.getAllByRole("tab").map((element) => element.textContent)).toEqual([
			expect.stringContaining(locale === "ar-SA" ? "فحص ATS" : "ATS check"),
			expect.stringContaining(locale === "ar-SA" ? "فحص البيانات" : "Data check"),
			expect.stringContaining(locale === "ar-SA" ? "الذكاء الاصطناعي" : "AI"),
		]);
		expect(documentState.locale).toBe("en-US");
		expect(screen.queryByText(/overall score|درجة إجمالية/iu)).toBeNull();
	},
);

it("shows the CV from the full-screen phone findings", async () => {
	render(
		<I18nProvider i18n={i18n}>
			<CheckPanel phone />
		</I18nProvider>,
	);
	await userEvent.click(screen.getByRole("button", { name: "Show CV" }));
	expect(useEditorStore.getState().mobileView).toBe("page");
});
it("returns to the same Download session", async () => {
	const editor = useEditorStore.getState();
	editor.setIdentity({ ownerId: "alice", resumeId: "resume", baseRevision: "v1", editGeneration: 1 });
	editor.setShareTab("download");
	editor.setExportHistoryFileName("سارة CV");
	editor.setExportHistoryReview(true);
	panel();
	await userEvent.click(screen.getByRole("button", { name: "Back to Download" }));
	expect(useEditorStore.getState()).toMatchObject({
		shareTab: "download",
		exportHistorySession: { fileName: "سارة CV", reviewReturn: false },
	});
});
