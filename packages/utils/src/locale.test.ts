import { describe, expect, it } from "vite-plus/test";
import {
	getLocaleAlternates,
	localizedUrl,
	resolveUiLocale,
	isUiLocale,
	localeSchema,
	getLocaleScript,
} from "./locale";

describe("product UI locale", () => {
	it.each([
		[{}, "ar-SA"],
		[{ requested: "en-US", saved: "ar-SA", cookie: "ar-SA" }, "en-US"],
		[{ requested: "de-DE", saved: "en-US", cookie: "ar-SA" }, "en-US"],
		[{ requested: "en-GB", saved: "bad", cookie: "en-US" }, "en-US"],
		[{ requested: "../en-US", saved: null, cookie: "zu-ZA" }, "ar-SA"],
	] as const)("resolves supported candidates in precedence order: %j", (input, expected) => {
		expect(resolveUiLocale(input)).toBe(expected);
	});
	it.each(["en-GB", "de-DE", "zu-ZA", "", null, undefined, {}])("does not ship %j as a product choice", (value) => {
		expect(isUiLocale(value)).toBe(false);
	});
	it("retains document locale and script behavior", () => {
		expect(localeSchema.parse("fa-IR")).toBe("fa-IR");
		expect(getLocaleScript("fa-IR")).toBe("arabic");
		expect(getLocaleScript("ko-KR")).toBe("hangul");
	});
});

describe("locale URLs", () => {
	it("supports a separate Arabic-first product policy without narrowing document defaults", () => {
		const policy = { defaultLocale: "ar-SA", locales: ["ar-SA", "en-US"] } as const;
		expect(localizedUrl("https://master.test/?locale=en-US&tab=help", "ar-SA", policy)).toBe(
			"https://master.test/?tab=help",
		);
		expect(getLocaleAlternates("https://master.test/", policy)).toEqual([
			{ hreflang: "ar-SA", href: "https://master.test/" },
			{ hreflang: "en-US", href: "https://master.test/?locale=en-US" },
			{ hreflang: "x-default", href: "https://master.test/" },
		]);
	});
	it("keeps the default locale on the plain address and puts others in the locale parameter", () => {
		expect(localizedUrl("https://rxresu.me/?locale=de-DE", "en-US")).toBe("https://rxresu.me/");
		expect(localizedUrl("https://rxresu.me/", "de-DE")).toBe("https://rxresu.me/?locale=de-DE");
	});

	it("lists valid hreflang alternates without the pseudo-locale", () => {
		const alternates = getLocaleAlternates("https://rxresu.me/");

		expect(alternates).toContainEqual({ hreflang: "x-default", href: "https://rxresu.me/" });
		expect(alternates).toContainEqual({ hreflang: "sr", href: "https://rxresu.me/?locale=sr-SP" });
		expect(alternates.map((alternate) => alternate.hreflang)).not.toContain("zu-ZA");
	});
});
