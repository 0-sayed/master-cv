import { describe, expect, it } from "vite-plus/test";
import { setupI18n } from "@lingui/core";
import { formatter } from "@lingui/format-po";
import { compileMessageOrThrow } from "@lingui/message-utils/compileMessage";
import { type CopyContractInput, validateCopyBindings, validateCopyContract } from "./copy-contract";

function first<T>(items: T[]): T {
	const item = items[0];
	if (item === undefined) throw new Error("Expected a nonempty test fixture");
	return item;
}

async function fixture(): Promise<CopyContractInput> {
	const parse = async (translation: string) =>
		formatter().parse(
			`#: src/components/test.tsx\nmsgctxt "common.continue"\nmsgid "Continue"\nmsgstr ${JSON.stringify(translation)}\n`,
			{ locale: "en-US", sourceLocale: "en-US", filename: "test.po" },
		);
	return {
		deck: {
			entries: [
				{
					key: "common.continue",
					messages: { "ar-SA": "متابعة", "en-US": "Continue" },
					context: { surfaces: ["components:button"] },
					interpolations: [],
					lingui: {
						msgid: "Continue",
						msgctxt: "common.continue",
						runtimeId: first(Object.keys(await parse("Continue"))),
					},
				},
			],
			components: { button: { strings: ["common.continue"] } },
		},
		catalogs: { "ar-SA": await parse("متابعة"), "en-US": await parse("Continue") },
		surfaces: [
			{
				id: "button",
				sources: ["src/components/"],
				keys: ["common.continue"],
				status: "active",
				owner: "T002",
				gate: null,
			},
		],
	};
}

describe("active copy contract", () => {
	it("accepts matching extracted identities and both candidate translations", async () => {
		expect(validateCopyContract(await fixture())).toEqual([]);
	});
	it("rejects duplicate semantic keys", async () => {
		const input = await fixture();
		input.deck.entries.push(first(input.deck.entries));
		expect(validateCopyContract(input)).toEqual(
			expect.arrayContaining([expect.objectContaining({ code: "duplicate-key", key: "common.continue" })]),
		);
	});
	it.each(["ar-SA", "en-US"] as const)("rejects empty %s deck copy", async (locale) => {
		const input = await fixture();
		first(input.deck.entries).messages[locale] = " ";
		expect(validateCopyContract(input).map((d) => d.code)).toContain("empty-copy");
	});
	it("rejects dangling deck surface references", async () => {
		const input = await fixture();
		first(input.deck.entries).context.surfaces = ["screens:missing"];
		expect(validateCopyContract(input).map((d) => d.code)).toContain("dangling-surface");
	});
	it("rejects missing active deck entries without hiding inherited copy", async () => {
		const input = await fixture();
		input.deck.entries = [];
		expect(validateCopyContract(input).map((d) => d.code)).toContain("missing-deck-message");
	});
	it("reports missing active runtime messages", async () => {
		const input = await fixture();
		input.catalogs["ar-SA"] = {};
		expect(validateCopyContract(input).map((d) => d.code)).toContain("missing-runtime-message");
	});
	it("rejects empty Arabic runtime translations despite an English fallback", async () => {
		const input = await fixture();
		first(Object.values(input.catalogs["ar-SA"])).translation = "";
		expect(validateCopyContract(input).map((d) => d.code)).toContain("empty-translation");
	});
	it.each(["msgid", "msgctxt", "runtimeId"] as const)("reports stale %s metadata", async (field) => {
		const input = await fixture();
		first(input.deck.entries).lingui[field] = "stale";
		expect(validateCopyContract(input).map((d) => d.code)).toContain("stale-identity");
	});
	it("requires typed interpolation parity", async () => {
		const input = await fixture();
		first(input.deck.entries).messages["ar-SA"] = "متابعة {count, number}";
		expect(validateCopyContract(input).map((d) => d.code)).toContain("placeholder-mismatch");
	});
	it("rejects incompatible declared argument types", async () => {
		const input = await fixture();
		const entry = first(input.deck.entries);
		entry.messages = {
			"ar-SA": "{count, plural, zero {لا شيء} one {واحد} two {اثنان} few {# عناصر} many {# عنصرا} other {# عنصر}}",
			"en-US": "{count, plural, one {# item} other {# items}}",
		};
		entry.interpolations = [{ name: "count", type: "string" }];
		expect(validateCopyContract(input).map((d) => d.code)).toContain("placeholder-type");
	});
	it("rejects incomplete Arabic plural categories", async () => {
		const input = await fixture();
		first(input.deck.entries).messages = {
			"ar-SA": "{count, plural, one {عنصر} other {# عناصر}}",
			"en-US": "{count, plural, one {# item} other {# items}}",
		};
		first(input.deck.entries).interpolations = [{ name: "count", type: "integer" }];
		expect(validateCopyContract(input).map((d) => d.code)).toContain("plural-categories");
	});
	it("reports invalid ICU syntax", async () => {
		const input = await fixture();
		first(input.deck.entries).messages["ar-SA"] = "{count, plural, other {broken}";
		expect(validateCopyContract(input).map((d) => d.code)).toContain("invalid-icu");
	});
	it("does not require runtime messages for off surfaces", async () => {
		const input = await fixture();
		first(input.surfaces).status = "off";
		first(input.surfaces).gate = "A14-A16";
		input.catalogs = { "ar-SA": {}, "en-US": {} };
		expect(validateCopyContract(input)).toEqual([]);
	});
	it("detects active messages omitted from the inventory keys", async () => {
		const input = await fixture();
		first(input.surfaces).keys = [];
		input.deck.entries = [];
		expect(validateCopyContract(input).map((d) => d.code)).toContain("unmapped-active-message");
	});
	it("does not count obsolete messages as active evidence", async () => {
		const input = await fixture();
		first(Object.values(input.catalogs["en-US"])).obsolete = true;
		expect(validateCopyContract(input).map((d) => d.code)).toContain("missing-runtime-message");
	});
});

describe("compiled ICU quantity contract", () => {
	const ar = "{count, plural, zero {zero} one {one} two {two} few {few} many {many} other {other}}";
	const en = "{count, plural, one {one} other {other}}";
	it.each([
		[0, "zero", "other"],
		[1, "one", "one"],
		[2, "two", "other"],
		[3, "few", "other"],
		[11, "many", "other"],
		[100, "other", "other"],
		[1.5, "other", "other"],
	] as const)("formats %s through actual Lingui compilation", (count, expectedAr, expectedEn) => {
		for (const [locale, message, expected] of [
			["ar-SA", ar, expectedAr],
			["en-US", en, expectedEn],
		] as const) {
			const instance = setupI18n({ locale, messages: { [locale]: { quantity: compileMessageOrThrow(message) } } });
			expect(instance._("quantity", { count })).toBe(expected);
		}
	});
});

describe("foundation copy bindings", () => {
	it("validates delivered bindings while the full audit still reports inherited copy", async () => {
		const input = await fixture();
		input.catalogs["en-US"].inherited = {
			message: "Inherited feature",
			translation: "Inherited feature",
			origin: [["src/components/legacy.tsx", 1]],
		};
		expect(validateCopyBindings(input)).toEqual([]);
		expect(validateCopyContract(input).map((d) => d.code)).toContain("unmapped-active-message");
	});
	it("rejects a scope with no active bindings", async () => {
		const input = await fixture();
		first(input.surfaces).keys = [];
		expect(validateCopyBindings(input).map((d) => d.code)).toContain("empty-binding-scope");
	});
	it("rejects a delivered key missing from the deck", async () => {
		const input = await fixture();
		input.deck.entries = [];
		expect(validateCopyBindings(input).map((d) => d.code)).toContain("missing-deck-message");
	});
	it.each(["ar-SA", "en-US"] as const)("still rejects a missing %s binding", async (locale) => {
		const input = await fixture();
		input.catalogs[locale] = {};
		expect(validateCopyBindings(input).map((d) => d.code)).toContain("missing-runtime-message");
	});
	it("still rejects a binding extracted from the wrong source", async () => {
		const input = await fixture();
		first(Object.values(input.catalogs["ar-SA"])).origin = [["src/other/test.tsx", 1]];
		expect(validateCopyBindings(input).map((d) => d.code)).toContain("missing-runtime-message");
	});
	it("still rejects empty translations and stale catalog contexts", async () => {
		const input = await fixture();
		first(Object.values(input.catalogs["ar-SA"])).translation = "";
		first(Object.values(input.catalogs["en-US"])).context = "wrong-context";
		const codes = validateCopyBindings(input).map((d) => d.code);
		expect(codes).toContain("empty-translation");
		expect(codes).toContain("stale-identity");
	});
});
