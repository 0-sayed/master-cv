import { beforeEach, describe, expect, it, vi, afterEach } from "vite-plus/test";
import { setupI18n } from "@lingui/core";
// @vitest-environment happy-dom
import Cookies from "js-cookie";
import { formatRelativeTime, getLocale, getLocaleMessages, getUiLocaleMessages } from "./locale";
import { themeMap } from "./theme";

describe("web UI locale resolution", () => {
	beforeEach(() => {
		Cookies.remove("locale");
		window.history.replaceState(null, "", "/");
	});
	it("defaults anonymous visitors to Arabic", () => {
		expect(getLocale()).toBe("ar-SA");
	});
	it("resolves saved preference before cookie without overwriting that cookie from a URL", () => {
		Cookies.set("locale", "ar-SA");
		expect(getLocale("en-US")).toBe("en-US");
		window.history.replaceState(null, "", "/?locale=en-US");
		expect(getLocale("ar-SA")).toBe("en-US");
		expect(Cookies.get("locale")).toBe("ar-SA");
	});
	it("ignores unsupported URL candidates individually", () => {
		window.history.replaceState(null, "", "/?locale=de-DE");
		expect(getLocale("en-US")).toBe("en-US");
	});
	it("loads Arabic UI messages with Latin ICU digits", async () => {
		const catalog = await getUiLocaleMessages("ar-SA");
		expect(catalog.locale).toBe("ar-SA");
		expect(catalog.locales).toBe("ar-SA-u-nu-latn");
		expect(Object.keys(catalog.messages).length).toBeGreaterThan(0);
	});
	it("retains accented test-only pseudolocale copy without exposing it as a UI choice", async () => {
		const pseudo = setupI18n();
		pseudo.loadAndActivate(await getLocaleMessages("zu-ZA"));
		const label = pseudo.t(themeMap.system);
		expect(label).not.toBe("Match my device");
		window.history.replaceState(null, "", "/?locale=zu-ZA");
		Cookies.set("locale", "zu-ZA");
		expect(getLocale()).toBe("ar-SA");
	});
});

afterEach(() => vi.useRealTimers());
it.each(["ar-SA", "en-US"])(
	"formats full relative durations with locale inflections and Latin digits (%s)",
	(locale) => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-11-11T12:00:00Z"));
		const formatter = new Intl.RelativeTimeFormat(new Intl.Locale(locale, { numberingSystem: "latn" }), {
			style: "long",
			numeric: "auto",
		});
		for (const hours of [1, 2, 3, 11]) {
			const result = formatRelativeTime(new Date(Date.now() - hours * 3600000), locale);
			expect(result).toBe(formatter.format(-hours, "hour"));
			expect(result).not.toMatch(/[٠-٩]/);
		}
		expect(formatRelativeTime(new Date(Date.now() - 86400000), locale)).toBe(formatter.format(-1, "day"));
	},
);
