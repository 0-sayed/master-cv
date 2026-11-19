import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { SuggestionDiff } from "./suggestion-diff";

const labels = { before: "Before", after: "After", showMore: "Show more", showLess: "Show less" };
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

it("keeps formatted tokens and swatches intact within the shared inline comparison", () => {
	const { container } = render(
		<SuggestionDiff
			before="Blue"
			after="Green"
			labels={labels}
			values={{
				before: (
					<span role="img" aria-label="Blue swatch">
						Blue
					</span>
				),
				after: <bdi dir="ltr">Green</bdi>,
			}}
		/>,
	);
	expect(screen.getByRole("img", { hidden: true })).toHaveAttribute("aria-label", "Blue swatch");
	expect(screen.getByRole("img", { hidden: true }).closest("del")).toBeTruthy();
	expect(container.querySelector("ins bdi")).toHaveAttribute("dir", "ltr");
	expect(container.querySelector(".rule-comparison-value")).toHaveAttribute("data-layout", "inline");
});

it("shows shared context once with non-color deletion and insertion cues", () => {
	const { container } = render(<SuggestionDiff before="Body text: 8 pt" after="Body text: 10 pt" labels={labels} />);
	const value = container.querySelector(".rule-comparison-value");
	if (!value) throw new Error("Missing comparison");
	expect(value.textContent).toBe("Body text: 8 10 pt");
	expect(value.querySelector("del")).toHaveTextContent("8");
	expect(value.querySelector("ins")).toHaveTextContent("10");
	expect(value).toHaveAttribute("aria-hidden", "true");
	expect(container.querySelector(".sr-only")).toHaveTextContent("Before: Body text: 8 pt. After: Body text: 10 pt.");
	expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it.each(["rtl", "ltr"])("stacks full replacements and isolates each value in %s", (direction) => {
	const { container } = render(
		<div dir={direction}>
			<SuggestionDiff before="رحلتي" after="الخبرة" labels={labels} />
		</div>,
	);
	const value = container.querySelector(".rule-comparison-value");
	if (!value) throw new Error("Missing comparison");
	expect(value).toHaveAttribute("data-layout", "stacked");
	expect(value.querySelector(".rule-comparison-arrow")).toHaveClass("rtl:-scale-x-100");
	expect(value).not.toHaveAttribute("dir");
	expect([...value.querySelectorAll("bdi")].map((element) => element.textContent)).toEqual(["رحلتي", "الخبرة"]);
	for (const element of value.querySelectorAll("bdi")) expect(element).toHaveAttribute("dir", "auto");
});

it("expands and collapses a long comparison, then resets for a different suggestion", async () => {
	let measure = () => {};
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
	const { container, rerender } = render(<SuggestionDiff before="Old text" after="Long new text" labels={labels} />);
	const value = container.querySelector(".rule-comparison-value");
	if (!value) throw new Error("Missing comparison");
	Object.defineProperties(value, { clientHeight: { value: 72 }, scrollHeight: { value: 144 } });
	(value as HTMLElement).style.lineHeight = "24px";
	act(() => measure());
	const more = screen.getByRole("button", { name: "Show more" });
	expect(more).toHaveAttribute("aria-controls", value.id);
	await userEvent.click(more);
	expect(value).toHaveAttribute("data-expanded", "true");
	await userEvent.click(screen.getByRole("button", { name: "Show less" }));
	expect(value).toHaveAttribute("data-expanded", "false");
	await userEvent.click(screen.getByRole("button", { name: "Show more" }));
	rerender(<SuggestionDiff before="Another old text" after="Another new text" labels={labels} />);
	expect(value).toHaveAttribute("data-expanded", "false");
});

it.each([26, 78])("does not mistake Arabic glyph overflow for extra lines at height %s", (height) => {
	let measure = () => {};
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
	const { container } = render(<SuggestionDiff before="متوقف" after="مفعّل عند دعمه" labels={labels} />);
	const value = container.querySelector<HTMLElement>(".rule-comparison-value");
	if (!value) throw new Error("Missing comparison");
	value.style.lineHeight = "26px";
	Object.defineProperties(value, { clientHeight: { value: height }, scrollHeight: { value: height + 4 } });
	act(() => measure());
	expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
});

it.each(["rtl", "ltr"])("uses only the shared logical arrow mirror in %s", (direction) => {
	const { container } = render(
		<div dir={direction}>
			<SuggestionDiff before="لا يظهر بريد إلكتروني" after="قريب أعلى الصفحة الأولى name@example.com" labels={labels} />
		</div>,
	);
	const arrow = container.querySelector(".rule-comparison-arrow");
	expect(arrow).toHaveClass("rtl:-scale-x-100");
	expect(arrow).not.toHaveAttribute("dir", "ltr");
	expect(container.querySelector("ins bdi")).toHaveTextContent("قريب أعلى الصفحة الأولى name@example.com");
});
