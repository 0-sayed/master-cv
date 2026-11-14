import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
// @vitest-environment happy-dom
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { TranslationReview } from "./translation-review";
const state = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));
vi.mock("@tanstack/react-query", () => ({
	useQuery: () => ({ data: state.data, refetch: vi.fn() }),
	useQueryClient: () => ({ invalidateQueries: vi.fn() }),
	useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/libs/orpc/client", () => ({ orpc: { ai: { variantReview: { get: { queryOptions: () => ({}) } } } } }));
vi.mock("../editor/proposals/review-operation", () => ({
	ReviewNotice: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));
vi.mock("../editor/proposals/review-client", () => ({ submitVariantDecision: vi.fn() }));
vi.mock("./clarification", () => ({
	Clarification: ({ questions }: { questions: Array<{ id: string; prompt: string; context?: string }> }) => (
		<>
			{questions.map((question) => (
				<div key={question.id}>
					<p>{question.context}</p>
					<p>{question.prompt}</p>
				</div>
			))}
		</>
	),
}));
afterEach(cleanup);
function show(terms: string[], segment: "pending" | "accepted", stale = false) {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	state.data = {
		result: {
			kind: "review.translation",
			sourceRevision: { id: "copy" },
			output: { segments: [{ sourceId: "source", text: "Generated target", claims: [] }] },
		},
		sourceSegments: [{ id: "source", text: "النص الأصلي" }],
		terms: { terms: terms.map((id) => ({ id, source: "المعهد", value: "Institute", status: "pending" })) },
		segments: { source: { text: "Generated target", status: segment } },
		statuses: { translation: "pending" },
		stale,
		undoable: [],
		answeredQuestionIds: [],
		dismissedQuestionIds: [],
	};
	return render(
		<I18nProvider i18n={i18n}>
			<TranslationReview operationId="operation" />
		</I18nProvider>,
	);
}
it.each([
	[["school"], "accepted", false],
	[[], "pending", false],
	[[], "accepted", true],
] as const)(
	"blocks final approval for unresolved terminology, unreviewed segments or stale source (%j)",
	(terms, segment, stale) => {
		show([...terms], segment, stale);
		expect(screen.getByRole("button", { name: "Approve language copy" }).hasAttribute("disabled")).toBe(true);
		expect(screen.getByText("النص الأصلي")).toBeDefined();
		expect(screen.getByText("Generated target")).toBeDefined();
	},
);
it("enables final approval only after all segments and terminology are reviewed", () => {
	show([], "accepted");
	expect(screen.getByRole("button", { name: "Approve language copy" }).hasAttribute("disabled")).toBe(false);
});

it("shows the cited job requirement, localized verdict and an actionable clarification instead of an enum and repeated explanation", () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	state.data = {
		result: {
			kind: "review.job-evidence",
			sourceRevision: { id: "cv" },
			output: {
				requirements: [
					{
						id: "requirement",
						spanIds: ["job-span"],
						verdict: "no_evidence",
						evidenceIds: [],
						explanation: "No supporting evidence was found in this CV.",
					},
				],
				notes: [],
			},
		},
		sourceSegments: [{ id: "job-span", text: "TypeScript and SAP required" }],
		terms: { terms: [] },
		segments: {},
		statuses: { report: "pending" },
		stale: false,
		undoable: [],
		answeredQuestionIds: [],
		dismissedQuestionIds: [],
	};
	render(
		<I18nProvider i18n={i18n}>
			<TranslationReview operationId="operation" />
		</I18nProvider>,
	);
	expect(screen.getAllByText(/TypeScript and SAP required/)).toHaveLength(2);
	expect(screen.queryByText(/no_evidence/)).toBeNull();
	expect(screen.getByText(/No evidence found/)).toBeDefined();
	expect(screen.getByText("What experience, study or project can you confirm for this requirement?")).toBeDefined();
	expect(screen.getAllByText(/No supporting evidence was found in this CV/)).toHaveLength(1);
});

it("explains partial job evidence with a visible recovery action", () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	state.data = {
		result: {
			kind: "review.job-evidence",
			sourceRevision: { id: "cv" },
			output: {
				requirements: [{ id: "requirement", spanIds: ["job"], verdict: "partial", explanation: "Built services." }],
				notes: [],
			},
		},
		sourceSegments: [{ id: "job", text: "TypeScript and SAP required" }],
		terms: { terms: [] },
		segments: {},
		statuses: { report: "pending" },
		stale: false,
		undoable: [],
		answeredQuestionIds: [],
		dismissedQuestionIds: [],
	};
	render(
		<I18nProvider i18n={i18n}>
			<TranslationReview operationId="operation" />
		</I18nProvider>,
	);
	expect(
		screen.getByText(
			"Only part of the job requirement is supported by this CV. Add confirmed information or request a new review.",
		),
	).toBeDefined();
});
