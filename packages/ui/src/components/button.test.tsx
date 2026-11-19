import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { Button, buttonVariants } from "./button";

describe("Button", () => {
	it.each(["quiet", "ghost"] as const)("keeps %s actions borderless until interaction", (variant) => {
		expect(buttonVariants({ variant }).split(" ")).not.toContain("border-line-2");
		expect(buttonVariants({ variant }).split(" ")).toContain("border-transparent");
	});

	it("keeps an explicit boundary for secondary actions", () => {
		expect(buttonVariants({ variant: "secondary" }).split(" ")).toContain("border-line-2");
	});

	it("shows a spinner, sets aria-busy and ignores clicks while loading", async () => {
		const onClick = vi.fn();
		render(
			<Button loading onClick={onClick}>
				Preparing…
			</Button>,
		);
		const button = screen.getByRole("button", { name: "Preparing…" });
		expect(button).toHaveAttribute("aria-busy", "true");
		expect(button.querySelector('[data-slot="spinner"]')).toHaveAttribute("aria-hidden", "true");
		await userEvent.click(button);
		expect(onClick).not.toHaveBeenCalled();
	});
});

it("keeps calendar chips keyboard operable and blocks busy activation", async () => {
	const user = userEvent.setup();
	const action = vi.fn();
	const { rerender } = render(
		<Button size="calendar-chip" onClick={action}>
			Interview
		</Button>,
	);
	await user.tab();
	expect(screen.getByRole("button")).toHaveFocus();
	await user.keyboard("{Enter}");
	expect(action).toHaveBeenCalledTimes(1);
	rerender(
		<Button size="calendar-chip" loading onClick={action}>
			Interview
		</Button>,
	);
	await user.click(screen.getByRole("button"));
	expect(action).toHaveBeenCalledTimes(1);
	expect(screen.getByRole("button")).toHaveAttribute("data-size", "calendar-chip");
});
