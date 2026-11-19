import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vite-plus/test";
// @vitest-environment happy-dom
import { createRef } from "react";
import { Disclosure, DisclosureContent, DisclosureSummary } from "./disclosure";
afterEach(cleanup);
it("keeps actions outside collapsed details and summary", () => {
	render(
		<Disclosure open={false} actions={<button>Copy link</button>}>
			<DisclosureSummary>Rule</DisclosureSummary>
			<DisclosureContent>Example</DisclosureContent>
		</Disclosure>,
	);
	const action = screen.getByRole("button", { name: "Copy link" });
	expect(action.closest("details,summary")).toBeNull();
	expect(screen.getByText("Rule").closest("summary")).toHaveClass("pe-14");
});
it("keeps native details semantics and controlled expansion", () => {
	const ref = createRef<HTMLElement>();
	const view = render(
		<Disclosure open={false}>
			<DisclosureSummary ref={ref} description="A full fix that stays readable after expansion">
				Rule
			</DisclosureSummary>
			<DisclosureContent>Reason and example</DisclosureContent>
		</Disclosure>,
	);
	const summary = screen.getByText("Rule").closest("summary");
	expect(summary?.parentElement?.tagName).toBe("DETAILS");
	expect(summary?.parentElement?.hasAttribute("open")).toBe(false);
	ref.current?.focus();
	expect(document.activeElement).toBe(summary);
	view.rerender(
		<Disclosure open>
			<DisclosureSummary description="A full fix that stays readable after expansion">Rule</DisclosureSummary>
			<DisclosureContent>Reason and example</DisclosureContent>
		</Disclosure>,
	);
	expect(screen.getByText("Rule").closest("details")?.open).toBe(true);
	expect(screen.getByText("A full fix that stays readable after expansion").className).toContain(
		"group-open/disclosure:line-clamp-none",
	);
	expect(summary?.className).toContain("focus-visible");
	expect(summary?.className.split(" ").some((token) => token.startsWith("h-"))).toBe(false);
	expect(summary?.querySelector("a,button")).toBeNull();
});
