import { expect, it } from "vite-plus/test";
import { createElement } from "react";
import { render } from "react-email";
import { PrivacyEmail } from "./privacy";

it.each(["ar-SA", "en-US"] as const)(
	"renders privacy mail with localized branding and local recovery links in %s",
	async (locale) => {
		const html = await render(
			createElement(PrivacyEmail, {
				kind: "export_ready",
				locale,
				appUrl: "http://127.0.0.1:23100",
				actionUrl: "http://127.0.0.1:23100/dashboard/settings/privacy",
			}),
		);
		expect(html).toContain(locale === "ar-SA" ? "سيراوايز" : "Sirawise");
		expect(html).not.toContain("Master CV");
		expect(html).toContain("http://127.0.0.1:23100/dashboard/settings/privacy");
	},
);
