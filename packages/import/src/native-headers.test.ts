import { describe, expect, it } from "vite-plus/test";
import { parseResumeText } from "./plain-text";

describe("native experience headers (synthetic)", () => {
	it.each([
		["Engineer Labs | Senior Engineer | London | 2024 – Present", "Engineer Labs", "Senior Engineer"],
		["Example Labs | London | 2024 – Present\nSENIOR SOFTWARE ENGINEER", "Example Labs", "SENIOR SOFTWARE ENGINEER"],
	])("keeps role-bearing company names and uppercase title lines: %s", (header, company, position) => {
		const data = parseResumeText(`EXPERIENCE\n${header}\n• Built a service.`);
		expect(data.sections.experience.items).toHaveLength(1);
		expect(data.sections.experience.items[0]).toMatchObject({
			company,
			position,
			location: "London",
			description: "<p>Built a service.</p>",
		});
	});
	it.each([
		[
			"Example Labs — Saudi Arabia · Remote | 2026-07 – Present\nSenior Software Engineer",
			"Example Labs",
			"Senior Software Engineer",
			"Saudi Arabia · Remote",
			"2026-07",
			null,
			true,
		],
		[
			"Example Labs — Saudi Arabia · Remote | 2024-07 – 2026-06\nSenior Software Engineer",
			"Example Labs",
			"Senior Software Engineer",
			"Saudi Arabia · Remote",
			"2024-07",
			"2026-06",
			false,
		],
		[
			"Senior Software Engineer at Example Labs | Jan 2024 – Present",
			"Example Labs",
			"Senior Software Engineer",
			"",
			"2024-01",
			null,
			true,
		],
		[
			"Senior Software Engineer, Example Labs, London, UK | 2024 – 2025",
			"Example Labs",
			"Senior Software Engineer",
			"London, UK",
			"2024",
			"2025",
			false,
		],
		[
			"شركة المثال — الرياض، السعودية · عن بُعد | ٢٠٢٤-٠٧ – حتى الآن\nمهندس برمجيات أول",
			"شركة المثال",
			"مهندس برمجيات أول",
			"الرياض، السعودية · عن بعد",
			"2024-07",
			null,
			true,
		],
		["مهندس برمجيات لدى شركة المثال | 2024 – حتى الآن", "شركة المثال", "مهندس برمجيات", "", "2024", null, true],
		["مهندس برمجيات في شركة المثال | 2024 – Present", "شركة المثال", "مهندس برمجيات", "", "2024", null, true],
		[
			"مهندس برمجيات، شركة المثال، الرياض، السعودية | 2024 – 2025",
			"شركة المثال",
			"مهندس برمجيات",
			"الرياض، السعودية",
			"2024",
			"2025",
			false,
		],
		[
			"Example Labs | Saudi Arabia | Jan 2024 – Present\nSenior Engineer",
			"Example Labs",
			"Senior Engineer",
			"Saudi Arabia",
			"2024-01",
			null,
			true,
		],
	] as const)("splits %s", (header, company, position, location, start, end, present) => {
		const data = parseResumeText(`EXPERIENCE\n${header}\n• Built a synthetic service.`, { locale: "ar-SA" });
		expect(data.sections.experience.items).toHaveLength(1);
		expect(data.sections.experience.items[0]).toMatchObject({
			company,
			position,
			location,
			dates: { start, end, present },
			description: "<p>Built a synthetic service.</p>",
		});
	});

	it.each(["Saudi Arabia", "Remote", "عن بُعد", "الرياض، السعودية"])(
		"never uses location %s as a position",
		(location) => {
			const issues: unknown[] = [];
			const data = parseResumeText(`EXPERIENCE\nExample Labs | ${location} | 2024 – Present\n• Built a service.`, {
				onUncertain: (issue) => issues.push(issue),
			});
			expect(data.sections.experience.items[0]?.position).toBe("");
			expect(issues).toContainEqual(expect.objectContaining({ field: "position" }));
		},
	);

	it("keeps an ambiguous header for review rather than inventing a role", () => {
		const issues: unknown[] = [];
		const data = parseResumeText("EXPERIENCE\nExample Labs | Unclear field | 2024 – 2025\n• Built a service.", {
			onUncertain: (issue) => issues.push(issue),
		});
		expect(data.sections.experience.items[0]?.position).toBe("");
		expect(issues).toContainEqual({ field: "position", source: "Unclear field" });
	});
});

describe("native basics headers (synthetic)", () => {
	it.each([
		"Taylor Example\nSenior Software Engineer\nCairo, Egypt  Egyptian Employer-specific information\ntaylor@example.test | +20 101 234 5678 | https://example.test",
		"Taylor Example\nSenior Software Engineer | Cairo, Egypt\ntaylor@example.test\n+20 101 234 5678\nhttps://example.test",
		"Taylor Example  Senior Software Engineer\nCairo, Egypt | taylor@example.test | +20 101 234 5678 | https://example.test",
	])("respects line and column boundaries: %s", (header) => {
		const data = parseResumeText(`${header}\nSKILLS\nTypeScript`);
		expect(data.basics).toMatchObject({
			name: "Taylor Example",
			headline: "Senior Software Engineer",
			location: "Cairo, Egypt",
			email: "taylor@example.test",
			phone: "+20 101 234 5678",
			website: { url: "https://example.test" },
		});
	});

	it("reads Arabic labels, Arabic comma, work mode and Persian contact digits", () => {
		const data = parseResumeText(
			"الاسم: سارة المثال\nالمسمى الوظيفي: مهندسة برمجيات\nالمدينة والدولة: القاهرة، مصر · عن بُعد\nالبريد الإلكتروني: sara@example.test\nالهاتف: +۲۰ ۱۰۱ ۲۳۴ ۵۶۷۸\nالموقع الإلكتروني: https://example.test\nالمهارات\nTypeScript",
			{ locale: "ar-SA" },
		);
		expect(data.basics).toMatchObject({
			name: "سارة المثال",
			headline: "مهندسة برمجيات",
			location: "القاهرة، مصر · عن بعد",
			email: "sara@example.test",
			phone: "+20 101 234 5678",
			website: { url: "https://example.test" },
		});
	});

	it("does not join a phone to a number on the next line", () => {
		const data = parseResumeText("Taylor Example\nSenior Engineer\n+20 101 234 5678\n2\ntaylor@example.test");
		expect(data.basics.phone).toBe("+20 101 234 5678");
	});

	it("preserves deliberate double-space phone groups rather than importing a suffix", () => {
		const data = parseResumeText("Taylor Example\nSenior Engineer\n+20  101  234  5678\ntaylor@example.test");
		expect(data.basics.phone).toBe("+20  101  234  5678");
	});

	it("keeps uncertain inline location evidence empty and flags it", () => {
		const issues: unknown[] = [];
		const data = parseResumeText(
			"Taylor Example\nSenior Engineer\nCairo, Egypt Egyptian Employer-specific\ntaylor@example.test",
			{ onUncertain: (issue) => issues.push(issue) },
		);
		expect(data.basics.location).toBe("");
		expect(issues).toContainEqual({ field: "location", source: "Cairo, Egypt Egyptian Employer-specific" });
	});
});
