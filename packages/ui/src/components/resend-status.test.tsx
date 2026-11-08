import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { ResendStatus } from "./resend-status";

describe("ResendStatus", () => {
	it("uses controlled remaining time without live announcements on each tick", async () => {
		const resend = vi.fn();
		const props = {
			remainingSeconds: 10,
			pending: false,
			onResend: resend,
			waitingLabel: (seconds: number) => `Wait ${seconds}`,
			availableLabel: "Resend",
		};
		const { rerender } = render(<ResendStatus {...props} />);
		expect(screen.getByRole("button", { name: "Wait 10" })).toBeDisabled();
		expect(screen.getByRole("status")).toBeEmptyDOMElement();
		rerender(<ResendStatus {...props} remainingSeconds={9} />);
		expect(screen.getByRole("status")).toBeEmptyDOMElement();
		rerender(<ResendStatus {...props} remainingSeconds={0} pending />);
		expect(screen.getByRole("button", { name: "Resend" })).toBeDisabled();
		rerender(<ResendStatus {...props} remainingSeconds={0} />);
		expect(screen.getByRole("status")).toHaveTextContent("Resend");
		await userEvent.click(screen.getByRole("button", { name: "Resend" }));
		expect(resend).toHaveBeenCalledOnce();
	});
});
