// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi, beforeEach } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { DownloadTab, getExportFormats, FileNameField, FormatRadioGroup } from "./download-tab";
const mocks = vi.hoisted(() => ({
	generate: vi.fn(),
	download: vi.fn(),
	toast: vi.fn(),
	saveStatus: "saved",
	pdfState: "complete",
	blockers: true,
}));
vi.mock("@/features/resume/builder/draft", () => ({
	useCurrentResume: () => ({ id: "resume" }),
	useResumeStore: Object.assign((select: (state: { saveStatus: string }) => unknown) => select(mocks), {
		getState: () => mocks,
	}),
}));
vi.mock("@/features/resume/editor/check/use-readiness", () => ({
	useReadiness: () => ({
		results: { pdf: { state: mocks.pdfState, issues: mocks.blockers ? [{ severity: "blocker" }] : [] } },
	}),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [] }) }));
vi.mock("@/features/applications/queries", () => ({ applicationsListQueryOptions: () => ({}) }));
vi.mock("@/features/letters/export", () => ({ createLetterFile: vi.fn(), letterFileName: vi.fn() }));
vi.mock("@/libs/orpc/client", () => ({ client: {} }));
vi.mock("@reactive-resume/ui/components/toast", () => ({ toast: { add: mocks.toast } }));
vi.mock("@reactive-resume/utils/file", () => ({ downloadWithAnchor: mocks.download }));
vi.mock("@/features/resume/export/use-resume-export", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/features/resume/export/use-resume-export")>()),
	createExportFile: mocks.generate,
	getDefaultFileName: () => "resume",
	sanitizeFileName: (v: string) => v,
}));
beforeEach(() => {
	vi.clearAllMocks();
	mocks.saveStatus = "saved";
	mocks.pdfState = "complete";
	mocks.blockers = true;
	i18n.load("en", {});
	i18n.activate("en");
});
it("disables an already open export sheet when a save conflict arrives", () => {
	const view = render(
		<I18nProvider i18n={i18n}>
			<DownloadTab onReview={() => {}} />
		</I18nProvider>,
	);
	expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled();
	mocks.saveStatus = "conflict";
	view.rerender(
		<I18nProvider i18n={i18n}>
			<DownloadTab onReview={() => {}} />
		</I18nProvider>,
	);
	expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
	fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
	expect(mocks.generate).not.toHaveBeenCalled();
});
it("offers PDF and disabled Word only until A05", () => {
	expect(getExportFormats().map((v) => v.id)).toEqual(["pdf", "docx"]);
	expect(getExportFormats().find((v) => v.id === "docx")?.disabled).toBe(true);
});
it("keeps PDF available with findings, reports failure honestly, and retries the actual download", async () => {
	i18n.load("en", {});
	i18n.activate("en");
	mocks.generate.mockRejectedValueOnce(new Error("Export unavailable"));
	render(
		<I18nProvider i18n={i18n}>
			<DownloadTab onReview={() => {}} />
		</I18nProvider>,
	);
	expect(screen.queryByRole("radio")).toBeNull();
	expect(screen.getByText(/Word export is not available/)).toBeVisible();
	fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
	const failure = await screen.findByText(/file could not be generated/);
	expect(failure.closest('[role="alert"]')).toHaveTextContent("Download failed.");
	expect(mocks.download).not.toHaveBeenCalled();
	const blob = new Blob(["synthetic-pdf"]);
	mocks.generate.mockResolvedValueOnce(blob);
	fireEvent.click(screen.getByRole("button", { name: "Try again" }));
	await waitFor(() => expect(mocks.download).toHaveBeenCalledWith(blob, "resume.pdf"));
	expect(screen.queryByRole("link", { name: "Donate" })).toBeNull();
	expect(screen.queryByRole("link", { name: /Discord/ })).toBeNull();
});

it("shows the current PDF blocker advisory and allows downloading", () => {
	const review = vi.fn();
	render(
		<I18nProvider i18n={i18n}>
			<DownloadTab onReview={review} />
		</I18nProvider>,
	);
	expect(screen.getByText("There is an issue that may block reading")).toBeVisible();
	expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled();
	fireEvent.click(screen.getByRole("button", { name: "Review" }));
	expect(review).toHaveBeenCalledOnce();
});
it.each(["stale", "checking", "failed", "not-checked"])("does not show old blockers for %s", (state) => {
	mocks.pdfState = state;
	render(
		<I18nProvider i18n={i18n}>
			<DownloadTab onReview={() => {}} />
		</I18nProvider>,
	);
	expect(screen.queryByText("There is an issue that may block reading")).not.toBeInTheDocument();
});

it("keeps raw typing until blur and freezes the actual filename for an in-flight download", async () => {
	let finish!: (blob: Blob) => void;
	mocks.generate.mockReturnValueOnce(
		new Promise<Blob>((resolve) => {
			finish = resolve;
		}),
	);
	render(
		<I18nProvider i18n={i18n}>
			<DownloadTab onReview={() => {}} />
		</I18nProvider>,
	);
	const input = screen.getByRole("textbox", { name: "File name" });
	fireEvent.change(input, { target: { value: " سيرة.PDF.pdf " } });
	expect(input).toHaveValue(" سيرة.PDF.pdf ");
	fireEvent.blur(input);
	expect(input).toHaveValue("سيرة");
	expect(screen.getByText("سيرة.pdf", { selector: "bdi" })).toHaveAttribute("dir", "ltr");
	fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
	fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
	fireEvent.change(input, { target: { value: "Later" } });
	finish(new Blob(["PDF"]));
	await waitFor(() => expect(mocks.download).toHaveBeenCalledWith(expect.any(Blob), "سيرة.pdf"));
	expect(mocks.generate).toHaveBeenCalledOnce();
});
it("retains the filename after failure and offers one primary retry", async () => {
	mocks.generate.mockRejectedValueOnce(new Error("offline"));
	render(
		<I18nProvider i18n={i18n}>
			<DownloadTab onReview={() => {}} />
		</I18nProvider>,
	);
	fireEvent.change(screen.getByRole("textbox"), { target: { value: "سارة CV" } });
	fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
	await screen.findByRole("button", { name: "Try again" });
	expect(screen.getAllByRole("button", { name: "Try again" })).toHaveLength(1);
	expect(screen.getByRole("textbox")).toHaveValue("سارة CV");
});
it.each(["not-checked", "checking", "complete", "partial", "skipped", "stale", "failed"])(
	"keeps free download available for %s readiness",
	(state) => {
		mocks.pdfState = state;
		mocks.blockers = false;
		render(
			<I18nProvider i18n={i18n}>
				<DownloadTab onReview={() => {}} />
			</I18nProvider>,
		);
		expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled();
		if (state !== "complete") expect(screen.queryByText("Review is complete. PDF download is free.")).toBeNull();
	},
);
it("retains generic letter format choices and filename callback behavior", () => {
	const change = vi.fn();
	render(
		<I18nProvider i18n={i18n}>
			<FormatRadioGroup
				formats={[
					{ id: "pdf", label: "PDF", extension: ".pdf", icon: "file-pdf", description: "PDF" },
					{ id: "md", label: "Markdown", extension: ".md", icon: "file-text", description: "Text" },
				]}
				value="pdf"
				onChange={vi.fn()}
			/>
			<FileNameField value="Letter" onChange={change} extension=".md" hint="Letter filename" />
		</I18nProvider>,
	);
	expect(screen.getAllByRole("radio")).toHaveLength(2);
	fireEvent.change(screen.getByRole("textbox"), { target: { value: "Letter/" } });
	expect(change).toHaveBeenCalledWith("Letter/");
});
