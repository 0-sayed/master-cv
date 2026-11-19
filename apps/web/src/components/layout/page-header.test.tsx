// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vite-plus/test";
import { PageHeader } from "./page-header";

afterEach(cleanup);

it("keeps a full functional record title beside its action", () => {
	const title = "Senior engineer مهندس التطبيقات with a long operational title";
	render(<PageHeader title={title} layout="record" titleVariant="functional" actions={<button>More</button>} />);
	const heading = screen.getByRole("heading", { level: 1, name: title });
	expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
	expect(heading.className).toContain("type-title-functional");
	expect(heading.closest("header")?.className).toContain("record-header");
	expect(heading.closest("header")?.contains(screen.getByRole("button"))).toBe(true);
});

it("preserves the default display header", () => {
	render(<PageHeader title="Documents" />);
	expect(screen.getByRole("heading").className).toContain("type-title");
	expect(screen.getByRole("heading").closest("header")?.className).toContain("flex-wrap");
});
it("keeps record navigation above the title and action row", () => {
	render(
		<PageHeader
			title="Long title"
			layout="record"
			back={<a href="/back">Back</a>}
			actions={<button>Options</button>}
		/>,
	);
	const header = screen.getByRole("heading", { level: 1 }).closest("header");
	expect(header?.children[0]).toHaveClass("col-span-full");
	expect(header?.children[1]).toContainElement(screen.getByRole("heading", { level: 1 }));
	expect(header?.children[2]).toContainElement(screen.getByRole("button", { name: "Options" }));
});
