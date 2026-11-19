import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { Icon } from "./icon";
import { SegmentedControl, SegmentedControlItem } from "./segmented-control";

it("preserves complete labels without ellipsis", () => {
	render(
		<SegmentedControl defaultValue="letter">
			<SegmentedControlItem value="letter">A very long translated paper name</SegmentedControlItem>
			<SegmentedControlItem value="a4">A4</SegmentedControlItem>
		</SegmentedControl>,
	);
	for (const item of screen.getAllByRole("radio")) {
		expect(item.className).toContain("min-w-0");
		expect(item.className).toContain("flex-1");
		expect(item.querySelector('[data-slot="segmented-control-label"]')?.className).not.toContain("truncate");
	}
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});
it("falls back to named icons when the complete labels cannot fit and restores them on resize", () => {
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
	const { container } = render(
		<SegmentedControl defaultValue="light">
			{["light", "dark", "system"].map((value) => (
				<SegmentedControlItem key={value} value={value}>
					<Icon name="sun" />
					<span>{value}</span>
				</SegmentedControlItem>
			))}
		</SegmentedControl>,
	);
	const group = container.querySelector('[data-slot="segmented-control"]');
	if (!group) throw new Error("Missing segments");
	Object.defineProperty(group, "clientWidth", { value: 120, configurable: true });
	for (const label of container.querySelectorAll('[data-slot="segmented-control-label"]'))
		Object.defineProperty(label, "scrollWidth", { value: 80 });
	act(measure);
	expect(group).toHaveAttribute("data-icon-only", "true");
	for (const value of ["light", "dark", "system"]) {
		expect(screen.getByRole("radio", { name: value })).toHaveAttribute("title", value);
	}
	Object.defineProperty(group, "clientWidth", { value: 400 });
	act(measure);
	expect(group).not.toHaveAttribute("data-icon-only");
});
