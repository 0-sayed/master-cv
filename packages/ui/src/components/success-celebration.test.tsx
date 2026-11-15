import { render, screen } from "@testing-library/react";
import { expect, it } from "vite-plus/test";
import { SuccessStatus } from "./success-celebration";

it("keeps saved outcomes still and celebrates a newly acknowledged result without replacing its message", () => {
	const { container, rerender } = render(<SuccessStatus complete>Applied</SuccessStatus>);
	expect(container.querySelector('[data-slot="success-celebration"]')).toHaveAttribute("data-animated", "false");
	rerender(<SuccessStatus complete={false}>Pending</SuccessStatus>);
	expect(container.querySelector('[data-slot="success-celebration"]')).toBeNull();
	rerender(<SuccessStatus complete>Applied</SuccessStatus>);
	expect(container.querySelector('[data-slot="success-celebration"]')).toHaveAttribute("data-animated", "true");
	expect(screen.getByRole("status")).toHaveTextContent("Applied");
	expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
	expect(container.querySelector('[data-slot="success-celebration"]')).toHaveAttribute("aria-hidden", "true");
});
