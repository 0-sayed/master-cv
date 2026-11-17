import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { BackNavigation } from "./back-navigation";

describe("BackNavigation", () => {
	it.each(["ltr", "rtl"])("keeps an accessible parent link and one directional mirror in %s", (dir) => {
		render(
			<div dir={dir}>
				<BackNavigation render={<a href="/dashboard/applications" />}>Back to applications</BackNavigation>
			</div>,
		);
		const link = screen.getByRole("link", { name: "Back to applications" });
		expect(link).toHaveAttribute("href", "/dashboard/applications");
		const icon = link.querySelector('[data-slot="icon"]');
		expect(icon).toHaveAttribute("aria-hidden", "true");
		expect(icon).toHaveClass("rtl:-scale-x-100");
		expect(icon).not.toHaveClass("rtl:rotate-180");
		expect(link.firstElementChild).toBe(icon);
		expect(link).toHaveAttribute("data-size", "header");
		expect(link.className).toContain("focus-visible:");
	});
	it("names an icon-only editor link", () => {
		render(
			<BackNavigation iconOnly render={<a href="/dashboard" />}>
				Back to documents
			</BackNavigation>,
		);
		expect(screen.getByRole("link", { name: "Back to documents" })).toHaveAttribute("href", "/dashboard");
	});
	it("returns within a local flow without submitting a form", async () => {
		const onClick = vi.fn();
		render(<BackNavigation onClick={onClick}>Back</BackNavigation>);
		const button = screen.getByRole("button", { name: "Back" });
		expect(button).toHaveAttribute("type", "button");
		await userEvent.click(button);
		expect(onClick).toHaveBeenCalledOnce();
	});
});
