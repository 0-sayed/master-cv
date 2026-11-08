import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vite-plus/test";
import { FormErrorSummary } from "./form-error-summary";

describe("FormErrorSummary", () => {
	it("focuses a submitted summary and sends each link to its field", async () => {
		render(
			<>
				<FormErrorSummary title="Check your details" errors={[{ fieldId: "phone", message: "Check phone" }]} />
				<input id="phone" aria-label="Phone" />
			</>,
		);
		expect(screen.getByRole("alert")).toHaveFocus();
		await userEvent.click(screen.getByRole("link", { name: "Check phone" }));
		expect(screen.getByRole("textbox", { name: "Phone" })).toHaveFocus();
	});
});
