// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { WordingDiff } from "./wording-diff";
afterEach(cleanup);
it.each([
	["en-US", "Scheduled clinic visits", "Coordinated clinic visits", "Coordinated"],
	["ar-SA", "تابعت طلبات الصيانة", "نسقت طلبات الصيانة", "نسقت"],
])("marks new wording and links its accessible legend in %s", (locale, before, after, added) => {
	i18n.load(locale, {});
	i18n.activate(locale);
	const { container } = render(
		<I18nProvider i18n={i18n}>
			<WordingDiff before={before} after={after} />
		</I18nProvider>,
	);
	expect(container.querySelector("mark")?.textContent).toBe(added);
	expect(container.querySelector("ins")?.textContent).toBe(after);
	const id = container.querySelector("ins")?.getAttribute("aria-describedby");
	expect(id && document.getElementById(id)?.textContent).toContain("New wording");
	expect(container.querySelector("mark")?.textContent).not.toContain("visits");
});
it("does not mark unchanged repeated words or punctuation", () => {
	i18n.load("en-US", {});
	i18n.activate("en-US");
	const { container } = render(
		<I18nProvider i18n={i18n}>
			<WordingDiff before="Reviewed logs and logs." after="Reviewed logs; and logs." />
		</I18nProvider>,
	);
	expect(container.querySelectorAll("mark")).toHaveLength(0);
	expect(screen.queryByText(/New wording/)).toBeNull();
});
