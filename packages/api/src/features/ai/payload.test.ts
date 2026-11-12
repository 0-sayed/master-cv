import { expect, it } from "vite-plus/test";
import { buildModelPayload } from "./payload";

it.each([
	["Alice Sentinel", "Alice <strong>Sentinel</strong> builds systems"],
	["alice@private.test", "alice@<b>private</b>.test builds systems"],
])("redacts markup-split known contacts: %s", (contact, text) => {
	const payload = buildModelPayload({
		selections: [{ section: "summary", confirmed: true, text }],
		contactValues: [contact],
	});
	expect(payload.selections[0]?.text).toBe("[redacted] builds systems");
});

it("excludes unconfirmed fields, contacts, markup attributes and embedded contact values", () => {
	const input = {
		selections: [
			{
				section: "experience",
				confirmed: true,
				text: "<p>Alice Sentinel builds systems alice@private.test +201012345678 https://private.test</p>",
			},
		],
		contactValues: ["Alice Sentinel"],
		contacts: { email: "contact-only@private.test" },
		history: "history-sentinel",
		attachment: "attachment-sentinel",
	};
	const bytes = JSON.stringify(buildModelPayload(input));
	expect(bytes).toContain("builds systems");
	for (const sentinel of [
		"Alice Sentinel",
		"alice@",
		"+2010",
		"https:",
		"contact-only",
		"history-sentinel",
		"attachment-sentinel",
		"<p>",
	])
		expect(bytes).not.toContain(sentinel);
	expect(() =>
		buildModelPayload({
			selections: [{ section: "experience", confirmed: false, text: "Unconfirmed" }],
			contactValues: [],
		}),
	).toThrow();
	expect(() =>
		buildModelPayload({
			selections: [{ section: "experience", confirmed: true, text: "x".repeat(32001) }],
			contactValues: [],
		}),
	).toThrow();
});

it.each([
	"al\u200bice@pri\u200dvate.test",
	"alice\u200e@private\u200f.test",
	"مستخدم@مثال.السعودية",
	"alice@例え.テスト",
	"مُستخدم@مثال.السعودية",
	"alice@xn--mgbh0fb.xn--kgbechtv",
	"xn--mgbh0fb.xn--kgbechtv/cv",
	"https://مثال.السعودية/س",
	"github.com/x",
	"private.test?token=query-sentinel",
	"private.test#fragment-sentinel",
	"مثال.السعودية?اسم=خاص#اتصال",
	"linkedin.com/in/x",
	"مثال.السعودية/س",
	"@sayed_dev",
	"@مستخدم",
	"050/123/4567",
	"050 123 4567",
	"+966 50 123 4567",
	"+20 10 1234 5678",
	"1234567",
	"٠٥٠ ١٢٣ ٤٥٦٧",
	"۰۵۰/۱۲۳/۴۵۶۷",
])("redacts embedded contact form %s", (contact) => {
	expect(
		buildModelPayload({
			selections: [{ section: "summary", confirmed: true, text: `Built systems ${contact} safely` }],
			contactValues: [],
		}).selections[0]?.text,
	).toBe("Built systems [redacted] safely");
});
it.each([
	"2019 - 2024",
	"2019-2024",
	"08/2019 - 12/2024",
	"35%",
	"40,000 users",
	"2019/08/01",
	"2024-12-31",
	"31/12/2024",
])("preserves non-contact facts %s", (text) => {
	expect(
		buildModelPayload({ selections: [{ section: "experience", confirmed: true, text }], contactValues: [] })
			.selections[0]?.text,
	).toBe(text);
});
