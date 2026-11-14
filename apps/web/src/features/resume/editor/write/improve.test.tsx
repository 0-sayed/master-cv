// @vitest-environment happy-dom
import type { Editor } from "@tiptap/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
const state = vi.hoisted(() => ({ data: null as unknown }));
vi.mock("@/features/resume/builder/draft", () => ({
	useResumeStore: (select: (value: unknown) => unknown) => select({ resume: { data: state.data } }),
}));
// Isolate transport; keeping this mounted represents the durable review/Undo UI.
vi.mock("../proposals/review-panel", () => ({
	ResumeReviewWorkspace: () => <button type="button">Undo accepted wording</button>,
}));
import { ImprovePanel } from "./improve";
it("keeps the opened target and review controls mounted after acceptance changes the saved passage", () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	const data = structuredClone(defaultResumeData);
	data.summary.content = "<p>Built services.</p>";
	state.data = data;
	const props = {
		editor: { commands: { focus: vi.fn() } } as unknown as Editor,
		line: { from: 1, to: 16, text: "Built services." },
		where: "Summary",
		onClose: vi.fn(),
	};
	const view = () => (
		<I18nProvider i18n={i18n}>
			<ImprovePanel {...props} />
		</I18nProvider>
	);
	const mounted = render(view());
	fireEvent.click(screen.getByRole("button", { name: "Stronger verb" }));
	expect(screen.getByRole("button", { name: "Undo accepted wording" })).toBeInTheDocument();
	state.data = { ...data, summary: { ...data.summary, content: "<p>Developed services.</p>" } };
	mounted.rerender(view());
	expect(screen.getByRole("button", { name: "Undo accepted wording" })).toBeInTheDocument();
	expect(screen.queryByText(/could not be identified uniquely/)).toBeNull();
});
