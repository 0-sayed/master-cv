import { beforeEach, describe, expect, it } from "vite-plus/test";
import { setupI18n } from "@lingui/core";
// @vitest-environment happy-dom
import Cookies from "js-cookie";
import { getLocale, getLocaleMessages, getUiLocaleMessages } from "./locale";
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
