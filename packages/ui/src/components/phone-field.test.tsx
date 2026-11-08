import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vite-plus/test";
import { useState } from "react";
import { PhoneField } from "./phone-field";

describe("PhoneField", () => {
	it("normalizes pasted digits without guessing country or stripping punctuation", async () => {
		function Field() {
			const [value, setValue] = useState("");
			return (
				<PhoneField
					aria-label="Phone"
					value={value}
					onValueChange={setValue}
					aria-invalid
					aria-describedby="phone-error"
				/>
			);
		}
		render(
			<>
				<Field />
				<p id="phone-error">Check the number</p>
			</>,
		);
		const input = screen.getByRole("textbox", { name: "Phone" });
		await userEvent.click(input);
		await userEvent.paste("+٩٦٦ ۰۱۲۳۴۵");
		expect(input).toHaveValue("+966 012345");
		expect(input).toHaveAttribute("dir", "ltr");
		expect(input).toHaveAttribute("type", "tel");
		expect(input).toHaveAccessibleDescription("Check the number");
	});
});
