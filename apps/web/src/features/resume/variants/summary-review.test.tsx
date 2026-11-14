// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { SummaryReview } from "./summary-review";

const state = vi.hoisted(() => ({ resume: {} as { id: string; data: unknown } }));
vi.mock("../builder/draft", () => ({
	useResumeStore: (select: (value: typeof state) => unknown) => select(state),
	savePendingChanges: vi.fn(),
}));
vi.mock("../editor/proposals/review-operation", () => ({ ReviewLaunch: () => null, ReviewOperationPanel: () => null }));
vi.mock("./translation-review", () => ({ TranslationReview: () => null }));
vi.mock("@/libs/orpc/client", () => ({ client: {} }));
afterEach(cleanup);

function toggleFact(control: HTMLElement) {
	// Dispatch through the native input: happy-dom does not forward Base UI's synthetic click.
	const input = control.parentElement?.querySelector("input");
	if (!input) throw new Error("Missing checkbox input");
	fireEvent.click(input);
}

it("limits summary facts to the payload capacity and lets users replace a selection", () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	const data = structuredClone(defaultResumeData);
	data.sections.skills.items = Array.from({ length: 50 }, (_, index) => ({
		id: `skill-${index}`,
		hidden: false,
		name: `Skill ${index}`,
		icon: "",
		iconColor: "",
		proficiency: "",
		level: 0,
		keywords: [],
	}));
	state.resume = { id: "cv", data };
	render(
		<I18nProvider i18n={i18n}>
			<SummaryReview locked={false} />
		</I18nProvider>,
	);
	fireEvent.click(screen.getByText("Select facts for the summary"));
	const boxes = screen.getAllByRole("checkbox");
	expect(boxes).toHaveLength(50);
	const first = boxes[0];
	const last = boxes[49];
	if (!first || !last) throw new Error("Missing summary facts");
	for (const box of boxes.slice(0, 49)) toggleFact(box);
	expect(boxes.filter((box) => box.getAttribute("aria-checked") === "true")).toHaveLength(49);
	expect(last.getAttribute("aria-disabled")).toBe("true");
	expect(first.getAttribute("aria-disabled")).not.toBe("true");
	toggleFact(first);
	expect(last.getAttribute("aria-disabled")).not.toBe("true");
	toggleFact(last);
	expect(boxes.filter((box) => box.getAttribute("aria-checked") === "true")).toHaveLength(49);
});
