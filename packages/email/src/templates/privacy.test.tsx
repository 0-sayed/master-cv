import { expect, it } from "vite-plus/test";
import { createElement } from "react";
import { render } from "react-email";
import { PrivacyEmail } from "./privacy";
it.each(["ar-SA", "en-US"] as const)("privacy notices use %s and an authenticated first-party link", async (locale) => {
	const html = await render(
		createElement(PrivacyEmail, {
			appUrl: "http://localhost:3030",
			kind: "export_ready",
			locale,
			actionUrl: "http://localhost:3030/dashboard/settings/privacy",
		}),
	);
	expect(html).toContain(`dir="${locale === "ar-SA" ? "rtl" : "ltr"}"`);
	expect(html).toContain("http://localhost:3030/dashboard/settings/privacy");
	expect(html).not.toMatch(/<img|token=|<script|attachment/i);
});
it("rejects remote action links", () => {
	expect(() =>
		PrivacyEmail({
			appUrl: "http://localhost:3030",
			kind: "export_ready",
			locale: "en-US",
			actionUrl: "https://other.example.test/archive",
		}),
	).toThrow("PRIVACY_MAIL_LINK_DENIED");
});
