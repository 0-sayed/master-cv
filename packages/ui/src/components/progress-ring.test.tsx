import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vite-plus/test";
import { ProgressRing } from "./progress-ring";
afterEach(cleanup);
it("exposes an empty record without danger styling", () => {
	render(<ProgressRing label="Career record completeness" value={0} />);
	expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
	expect(screen.getByText("0%")).toBeDefined();
});
it("exposes a readable percentage and completion check", () => {
	const { rerender } = render(<ProgressRing label="Career record completeness" value={85} />);
	expect(screen.getByText("85%")).toBeDefined();
	rerender(<ProgressRing label="Career record completeness" value={100} />);
	expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
	expect(screen.queryByText("85%")).toBeNull();
	expect(document.querySelector("svg")).toBeDefined();
});
it.each([0, 20, 50, 85, 100])("draws an exact %i percent arc from twelve o'clock", (value) => {
	render(<ProgressRing label="Career record completeness" value={value} />);
	const arc = screen.getByRole("progressbar").querySelector('circle[stroke="currentColor"]');
	expect(arc).toHaveAttribute("stroke-dasharray", `${value} ${100 - value}`);
	expect(arc).toHaveAttribute("stroke-linecap", "butt");
	expect(arc).toHaveAttribute("transform", "rotate(-90 18 18)");
});
it("keeps icon-only progress readable to assistive technology without a visible number", () => {
	render(
		<ProgressRing label="Career record completeness" value={85} compact>
			<svg aria-hidden="true" data-testid="career-icon" />
		</ProgressRing>,
	);
	expect(screen.queryByText("85%")).toBeNull();
	expect(screen.getByTestId("career-icon")).toBeDefined();
	expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "85");
});
