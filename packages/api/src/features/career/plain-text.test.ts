import { expect, it } from "vite-plus/test";
import { careerPlainText } from "./plain-text";

it("keeps list points and decoded characters without markup or executable content", () => {
	expect(careerPlainText("<p>R&amp;D&nbsp;lead</p><ul><li>One</li><li>اثنان</li></ul><script>secret()</script>")).toBe(
		"R&D lead\nOne\nاثنان",
	);
});

it("preserves plain text comparisons and line breaks", () => {
	expect(careerPlainText("Budget < 3 million\nDelivery > 90% ")).toBe("Budget < 3 million\nDelivery > 90% ");
});
