// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { analyzeJobTerms, JOB_NORMALIZATION_VERSION, JOB_RUBRIC_VERSION } from "@reactive-resume/resume/ats";
import { jobEvidenceViewSchema } from "@reactive-resume/schema/job-evidence";
import { JobEvidencePage } from "./job-evidence-page";
vi.mock("@tanstack/react-query", () => ({
	useQuery: () => ({ data: undefined }),
	useMutation: () => ({ isPending: false }),
}));
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
	Link: ({ children }: { children: React.ReactNode }) => <a href="/builder/cv">{children}</a>,
}));
vi.mock("@/libs/orpc/client", () => ({
	client: {},
	orpc: { resume: { variants: { list: { queryOptions: () => ({}) } }, getById: { queryOptions: () => ({}) } } },
}));
vi.mock("@/features/resume/editor/proposals/review-operation", () => ({
	ReviewLaunch: () => null,
	ReviewNotice: () => null,
	ReviewOperationPanel: () => null,
}));
vi.mock("@/features/resume/variants/translation-review", () => ({ TranslationReview: () => null }));
afterEach(cleanup);
const identity = {
	resumeId: "cv",
	resumeRevision: "v1",
	contentHash: "hash",
	jobId: "job",
	jobRevision: "1",
	rubricVersion: JOB_RUBRIC_VERSION,
	normalizationVersion: JOB_NORMALIZATION_VERSION,
};
const literal = analyzeJobTerms({
	identity,
	jobText: "React SAP",
	passages: [{ id: "summary", target: { sectionId: "summary", field: "content" }, text: "React" }],
});
function show(complete: boolean) {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	const data = jobEvidenceViewSchema.parse({
		selection: null,
		job: null,
		literal,
		semantic: complete
			? {
					state: "complete",
					operationId: "review",
					identity,
					findings: {
						requirements: ["supported", "partial", "no_evidence", "unclear"].map((verdict, index) => ({
							id: String(index),
							spanIds: [],
							importance: "unstated",
							verdict,
							evidenceIds: [],
							explanation: "Verified requirement " + index,
						})),
						notes: [],
					},
				}
			: { state: "not-checked" },
	});
	render(
		<I18nProvider i18n={i18n}>
			<JobEvidencePage resumeId="cv" data={data} onChange={vi.fn()} onRefresh={vi.fn()} />
		</I18nProvider>,
	);
}
it("keeps literal occurrence available while semantic processing is unavailable", () => {
	show(false);
	expect(screen.getByText("1 of 2 selected terms appear in this CV.")).toBeDefined();
	expect(screen.getByText(/not ability or all advertised requirements/)).toBeDefined();
	expect(screen.getByText(/requires a separately verified review/)).toBeDefined();
	expect(screen.queryByText("Evidence found")).toBeNull();
});
it("shows all verified verdicts separately without altering the literal denominator", () => {
	show(true);
	for (const text of ["Evidence found", "Partial evidence", "No evidence found", "Unclear"])
		expect(screen.getByText(text)).toBeDefined();
	expect(screen.getByText("1 of 2 selected terms appear in this CV.")).toBeDefined();
	expect(screen.getAllByRole("link", { name: "Add a fact" })).toHaveLength(3);
});
