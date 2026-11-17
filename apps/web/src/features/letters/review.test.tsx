// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const state = vi.hoisted(() => ({
	decision: null as "accept" | "reject" | null,
	content: "Manual original",
	decide: vi.fn(),
}));
vi.mock("@/libs/orpc/client", () => ({
	client: {
		ai: {
			operations: {
				result: async () => ({
					output: { paragraphs: [{ text: "Supported proposal", claims: [] }], notes: [] },
					evidence: [{ id: "fact", text: "Confirmed experience" }],
				}),
			},
		},
		coverLetters: {
			getReview: async () => ({ decision: state.decision, versionId: null }),
			decideReview: state.decide,
		},
	},
}));
vi.mock("./store", () => {
	const current = () => ({
		letter: { id: "letter", content: state.content, revision: 1 },
		change: async (action: (letter: unknown) => Promise<unknown>) => action(current().letter),
	});
	return {
		useLetterEditorStore: Object.assign((selector: (value: unknown) => unknown) => selector(current()), {
			getState: current,
		}),
	};
});
vi.mock("../resume/editor/proposals/review-operation", () => ({
	ReviewNotice: ({ children, retry }: { children: React.ReactNode; retry?: () => void }) => (
		<div role="alert">
			{children}
			{retry && <button onClick={retry}>Retry</button>}
		</div>
	),
}));
import { LetterReview } from "./review";

beforeEach(() => {
	state.content = "Manual original";
	state.decision = null;
	state.decide.mockReset();
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
});
function show() {
	return render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
				<LetterReview letterId="letter" operationId="operation" expectedRevision={1} />
			</QueryClientProvider>
		</I18nProvider>,
	);
}
it("shows original, proposal and evidence without saving generated text", async () => {
	show();
	expect(await screen.findByText("Supported proposal")).toBeTruthy();
	expect(screen.getByText("Manual original")).toBeTruthy();
	expect(screen.getByText("Confirmed experience")).toBeTruthy();
	expect(state.decide).not.toHaveBeenCalled();
	expect(state.content).toBe("Manual original");
});
it("keeps manual content and reuses the decision key after a failed acceptance", async () => {
	state.decide.mockRejectedValue(new Error("save failed"));
	show();
	fireEvent.click(await screen.findByRole("button", { name: "Accept proposal" }));
	await screen.findByRole("alert");
	expect(state.content).toBe("Manual original");
	fireEvent.click(screen.getByRole("button", { name: "Accept proposal" }));
	await waitFor(() => expect(state.decide).toHaveBeenCalledTimes(2));
	expect(state.decide.mock.calls[0]?.[0].requestKey).toBe(state.decide.mock.calls[1]?.[0].requestKey);
});
it("shows a persisted rejection when the review reopens", async () => {
	state.decision = "reject";
	show();
	expect(await screen.findByText("Proposal rejected. Your letter is unchanged.")).toBeTruthy();
	expect(screen.queryByRole("button", { name: "Accept proposal" })).toBeNull();
	expect(state.decide).not.toHaveBeenCalled();
});
