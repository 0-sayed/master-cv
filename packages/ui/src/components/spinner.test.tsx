import { render, screen } from "@testing-library/react";
import { expect, it } from "vite-plus/test";
import { Spinner } from "./spinner";

it("announces the caller's localized loading label", () => {
	render(<Spinner label="جارٍ التحميل" />);
	expect(screen.getByRole("status", { name: "جارٍ التحميل" })).toBeDefined();
});

it("keeps decorative loading indicators silent", () => {
	const { container } = render(<Spinner decorative />);
	expect(screen.queryByRole("status")).toBeNull();
	expect(container.querySelector('[data-slot="spinner"]')).toHaveAttribute("aria-hidden", "true");
});
