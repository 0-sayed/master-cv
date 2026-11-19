// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vite-plus/test";
import { SectionCard, SectionCardBody, SectionCardHeader, SectionCardRow, SectionCardTitle } from "./section-card";
afterEach(cleanup);
it("defaults to H3 and supports an H2 section title", () => {
	const { rerender } = render(<SectionCardTitle>Heading</SectionCardTitle>);
	expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Heading");
	rerender(<SectionCardTitle as="h2">Heading</SectionCardTitle>);
	expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Heading");
});
it("preserves default card spacing and supplies shared flush padding", () => {
	const { rerender } = render(
		<SectionCard aria-label="Card">
			<SectionCardHeader>Heading</SectionCardHeader>Content
		</SectionCard>,
	);
	expect(screen.getByRole("region").className).toContain("p-4");
	expect(screen.getByRole("region").className).toContain("gap-3");
	rerender(
		<SectionCard variant="flush" aria-label="Card">
			<SectionCardHeader>Heading</SectionCardHeader>
			<SectionCardBody>Content</SectionCardBody>
		</SectionCard>,
	);
	expect(screen.getByRole("region").getAttribute("data-variant")).toBe("flush");
	expect(screen.getByText("Content").className).toContain("p-4");
});
it("keeps center alignment as the default", () => {
	render(<SectionCardRow>Entry</SectionCardRow>);
	expect(screen.getByRole("article").className).toContain("items-center");
});
it.each(["plain", "outlined"] as const)("supports start alignment for %s rows", (variant) => {
	render(
		<SectionCardRow variant={variant} align="start">
			Entry
		</SectionCardRow>,
	);
	expect(screen.getByRole("article").className).toContain("items-start");
	expect(screen.getByRole("article").className).not.toContain("items-center");
});
