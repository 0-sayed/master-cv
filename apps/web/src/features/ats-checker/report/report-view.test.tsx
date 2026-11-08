// @vitest-environment happy-dom
import { render, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeAll, expect, it } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { analyzePdfResume } from "@reactive-resume/resume/ats-pdf";
import { AtsPdfReportView } from "./report-view";

beforeAll(() => i18n.loadAndActivate({ locale: "en-US", messages: {} }));
afterEach(cleanup);
it.each(["partial", "failed", undefined] as const)(
	"shows neutral no-score copy for an empty unqualified category: %s",
	(status) => {
		const report = analyzePdfResume({
			version: 1,
			file: { name: "test.pdf", sizeBytes: 1, magicBytesOk: true },
			pageCount: 0,
			truncated: false,
			pages: [],
			fonts: [],
			links: [],
			operatorsAvailable: false,
			metadata: {
				producer: null,
				creator: null,
				title: null,
				author: null,
				language: null,
				pdfVersion: null,
				isEncrypted: false,
				isXfa: false,
				isCollection: false,
				isTagged: false,
				hasAcroForm: false,
			},
		});
		report.score = 100;
		report.findings = [];
		if (status) report.analysis = { status, reasons: ["controlled failure"] };
		else delete report.analysis;
		const view = render(
			<I18nProvider i18n={i18n}>
				<AtsPdfReportView report={report} />
			</I18nProvider>,
		);
		const firstCategory = view.getAllByRole("button")[0];
		if (!firstCategory) throw new Error("Missing category toggle");
		fireEvent.click(firstCategory);
		expect(view.getByText("No overall score is available.")).toBeTruthy();
		expect(view.queryByText("100")).toBeNull();
		expect(view.getByRole("status").textContent).toMatch(/incomplete|could not be completed/i);
	},
);
