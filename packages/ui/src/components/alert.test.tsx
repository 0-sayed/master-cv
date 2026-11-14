import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { Alert, AlertTitle, AlertDescription, AlertActions } from "./alert";
import { Button } from "./button";
import { Icon } from "./icon";

describe("Alert", () => {
	it("places actions after the message in a wrapping text-column footer", () => {
		const { container } = render(
			<Alert variant="info">
				<Icon name="info" />
				<AlertTitle>Notice</AlertTitle>
				<AlertDescription>Details</AlertDescription>
				<AlertActions>
					<Button variant="secondary">Got it</Button>
				</AlertActions>
			</Alert>,
		);
		const footer = screen.getByText("Got it").parentElement;
		expect(footer).toHaveAttribute("data-slot", "alert-actions");
		expect(footer?.previousElementSibling).toHaveAttribute("data-slot", "alert-description");
		expect(footer).toHaveClass("flex-wrap", "group-has-[>[data-slot=icon]]/alert:col-start-2");
		expect(footer?.className).toContain("border-info-text");
		expect(container.querySelector('[data-slot="alert"]')).toHaveAttribute("data-variant", "info");
	});
	it("announces only errors", () => {
		const { rerender } = render(<Alert variant="error">Couldn't reach OpenAI.</Alert>);
		expect(screen.getByRole("alert")).toHaveTextContent("Couldn't reach OpenAI.");

		rerender(<Alert variant="info">Job match uses the posting from Lumen Health.</Alert>);
		expect(screen.getByText("Job match uses the posting from Lumen Health.")).toBeInTheDocument();
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});
});
