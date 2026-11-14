import { expect, it } from "vite-plus/test";
import { buildModelPayload } from "./payload";

it("keeps opaque provenance for explicitly unconfirmed sources without relabelling facts", () => {
	expect(
		buildModelPayload({
			selections: [
				{
					id: "source1",
					kind: "unconfirmed_source",
					section: "certifications",
					text: "Unknown qualification contact@example.test",
				},
			],
			contactValues: [],
		}).selections,
	).toEqual([
		{ id: "source1", kind: "unconfirmed_source", section: "certifications", text: "Unknown qualification [redacted]" },
	]);
	expect(() =>
		buildModelPayload({
			selections: [{ id: "empty", kind: "user_supplied", section: "summary", text: "   " }],
			contactValues: [],
		}),
	).toThrow();
});

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

it.each([
	"1442/03/15",
	"1440 - 1445",
	"١٤٤٢ - ١٤٤٥ هـ",
	"٢٠١٩ - ٢٠٢٢",
	"03/1442 - 07/1445",
	"١٤٤٢/٠٣/١٥",
	"۰۳/۱۴۴۲ - ۰۷/۱۴۴۵",
	"15/03/1442 - 20/07/1445",
	"2019/08/01 - 2024/12/31",
	"٢٠١٩/٠٨/٠١ - ٢٠٢٤/١٢/٣١",
	"2019 – 2024; 1440—1445",
	"Worked in 1442 and 2024",
	"Node.js, ASP.NET, Vue.js, .NET and C#",
	"Built Node.js/TypeScript services and ASP.NET/C# APIs",
	"Processed 1234567 records with 35% fewer errors",
	"Served 1234567890 requests and 25000000 users",
	"Saved SAR 1234567 and 2000000000 SAR in operating costs",
	"Saved $1234567 and ر.س 2000000000 in operating costs",
	"عالجت ١٢٣٤٥٦٧ طلبا وخفضت التكلفة بمقدار ٢٠٠٠٠٠٠٠٠٠ ريال بنسبة ٣٥٪",
	"Improved throughput by 1234567%",
	"Improved throughput by +1234567%",
	"Generated 1234567 events",
	"Requests: 1234567",
	"Reduced costs by 1234567",
	"Completed 1234567 builds",
	"05/01/1442 - 05/01/1445",
	"٠٥/٠١/١٤٤٢ - ٠٥/٠١/١٤٤٥",
	"05/1442 - 07/1445",
	"Migrated 1234567 events",
	"Increased throughput to 1234567 events per day",
	"Lowered costs by 1234567 annually",
])("minimised payload preserves protected fixture values: %s", (text) => {
	expect(
		buildModelPayload({ selections: [{ section: "experience", confirmed: true, text }], contactValues: [] })
			.selections[0]?.text,
	).toBe(text);
});

it.each([
	"+966 55 123 4567",
	"+966551234567",
	"0551234567",
	"966551234567",
	"966 55 123 4567",
	"00966 55 123 4567",
	"+1 (202) 555-0123",
	"+44 20 7946 0958",
	"١٢٣٤٥٦٧٨٩٠",
	"٢١٣٤٥٦٧٨٩٠",
	"1234567890",
	"2134567890",
	"user+cv@example.com",
	"https://linkedin.com/in/synthetic",
	"www.github.com/synthetic",
	"asp.net/my-profile",
	"node.js/my-profile",
])("contacts still redacted: %s", (contact) => {
	expect(
		buildModelPayload({
			selections: [
				{ section: "summary", confirmed: true, text: `Contact (${contact}); built Node.js services in 1442/03/15` },
			],
			contactValues: [],
		}).selections[0]?.text,
	).toBe("Contact ([redacted]); built Node.js services in 1442/03/15");
});

it.each([
	["National ID: 1234567890", "National ID: [redacted]"],
	["Iqama number: 2134567890", "Iqama number: [redacted]"],
	["رقم الهوية: ١٢٣٤٥٦٧٨٩٠", "رقم الهوية: [redacted]"],
	["رقم الإقامة: ٢١٣٤٥٦٧٨٩٠", "رقم الإقامة: [redacted]"],
	["1234567890", "[redacted]"],
	["2134567890", "[redacted]"],
	["Website: jane-portfolio.com", "Website: [redacted]"],
	["Website: asp.net/my-profile", "Website: [redacted]"],
	["Phone: (202) 555-0123", "Phone: [redacted]"],
	["Phone: 020 7946 0958", "Phone: [redacted]"],
	["Contact +44 20 7946 0958 35% improvement", "Contact [redacted] 35% improvement"],
	["Contact +1 (202) 555-0123 35% improvement", "Contact [redacted] 35% improvement"],
	["Contact +20 10 1234 5678 35% improvement", "Contact [redacted] 35% improvement"],
	["Contact +966 55 123 4567 35% improvement", "Contact [redacted] 35% improvement"],
	["Contact +1 (202) 555-0123 2019 - 2024", "Contact [redacted] 2019 - 2024"],
	["Phone: (202) 555-0123 2019 - 2024", "Phone: [redacted] 2019 - 2024"],
	[
		"Phone: +966 55 123 4567; processed 1234567 records in 1442/03/15",
		"Phone: [redacted]; processed 1234567 records in 1442/03/15",
	],
])("redacts labelled and standalone identities while preserving adjacent facts: %s", (text, expected) => {
	expect(
		buildModelPayload({ selections: [{ section: "experience", confirmed: true, text }], contactValues: [] })
			.selections[0]?.text,
	).toBe(expected);
});

// F1: unlabelled, formatted phones must not enter a minimized payload.
it.each([
	"011 123 4567",
	"011-123-4567",
	"(212) 555-0123",
	"020 7946 0958",
	"212 555 0123",
	"555-0123",
	"+966 11 123 4567",
	"00966 (11) 123-4567",
	"05 (012) 34567",
	"٠١١ ١٢٣ ٤٥٦٧",
])("redacts formatted phones without contact labels: %s", (phone) => {
	const text = `Built Node.js services. Reach ${phone}; served 1234567 records in 05/1442 - 07/1445 with 35% savings.`;
	expect(
		buildModelPayload({ selections: [{ section: "summary", confirmed: true, text }], contactValues: [] }).selections[0]
			?.text,
	).toBe("Built Node.js services. Reach [redacted]; served 1234567 records in 05/1442 - 07/1445 with 35% savings.");
});

it("redacts a parenthesized full local phone while preserving prose parentheses", () => {
	expect(
		buildModelPayload({
			selections: [{ section: "summary", confirmed: true, text: "Reach (212-555-0123)." }],
			contactValues: [],
		}).selections[0]?.text,
	).toBe("Reach ([redacted]).");
});

it.each(["0111234567", "(011)1234567", "(212)5550123", "212.555.0123"])(
	"redacts compact local contact formatting: %s",
	(phone) => {
		expect(
			buildModelPayload({
				selections: [{ section: "summary", confirmed: true, text: `Reach ${phone}; built Node.js services.` }],
				contactValues: [],
			}).selections[0]?.text,
		).toBe("Reach [redacted]; built Node.js services.");
	},
);
