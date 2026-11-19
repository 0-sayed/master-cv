import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { RuleDetail } from "./rule-detail";

afterEach(cleanup);
const labels = {
	why: "Why it matters",
	before: "Before",
	after: "After",
	showMore: "Show more",
	showLess: "Show less",
};

it("keeps the comparison visible and reveals only the reason on request", async () => {
	render(
		<RuleDetail
			compact
			labels={labels}
			why="Use a familiar heading."
			example={{ before: "My journey", after: "Experience" }}
		/>,
	);
	expect(document.querySelector(".rule-comparison-value del")).toHaveTextContent("My journey");
	expect(document.querySelector(".rule-comparison-value ins")).toHaveTextContent("Experience");
	expect(screen.queryByText("Use a familiar heading.")).not.toBeInTheDocument();
	await userEvent.click(screen.getByRole("button", { name: labels.why }));
	expect(screen.getByText("Use a familiar heading.")).toBeVisible();
	expect(document.querySelector('[data-slot="accordion-content"] [data-slot="rule-comparison"]')).toBeNull();
});

it.each([340, 390, 468])("keeps mixed-direction values isolated and expands overflow at width %s", async (width) => {
	let measure = () => {};
	const original = globalThis.ResizeObserver;
	vi.stubGlobal(
		"ResizeObserver",
		class {
			constructor(callback: () => void) {
				measure = callback;
			}
			observe() {}
			disconnect() {}
		},
	);
	try {
		render(
			<div style={{ width }}>
				<RuleDetail
					compact
					labels={labels}
					why="Reason"
					example={{ before: "وظيفة مستمرة منذ 2022", after: "2022–حتى الآن" }}
				/>
			</div>,
		);
		const value = document.querySelector(".rule-comparison-value ins bdi");
		if (!value) throw new Error("Missing inserted value");
		expect(value.tagName).toBe("BDI");
		expect(value).toHaveAttribute("dir", "auto");
		const paragraph = value.closest("p");
		if (!paragraph) throw new Error("Missing value");
		paragraph.style.lineHeight = "24px";
		Object.defineProperties(paragraph, { clientHeight: { value: 72 }, scrollHeight: { value: 144 } });
		act(() => measure());
		const more = screen.getByRole("button", { name: "Show more" });
		expect(more).toHaveAttribute("aria-controls", paragraph.id);
		await userEvent.click(more);
		expect(paragraph).toHaveAttribute("data-expanded", "true");
		expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
	} finally {
		globalThis.ResizeObserver = original;
		vi.unstubAllGlobals();
	}
});

it("keeps guide reasons and full examples readable without an extra disclosure", () => {
	render(
		<RuleDetail labels={labels} why="Read the heading." example={{ before: "My journey", after: "Experience" }} />,
	);
	expect(screen.getByText("Read the heading.")).toBeVisible();
	expect(document.querySelector(".rule-comparison-value")).not.toHaveClass("truncate");
	expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
