// @vitest-environment happy-dom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { FindingHelp } from "./finding-help";
import { getUiLocaleMessages } from "@/libs/locale";

afterEach(cleanup);
it.each(["UNTAGGED_PDF", "NON_STANDARD_SECTION_TITLE", "EMPTY_PERIOD", "MISSING_LOCATION"] as const)(
	"never presents catalog examples as candidate values for %s",
	(code) => {
		i18n.loadAndActivate({ locale: "en-US", messages: {} });
		render(
			<I18nProvider i18n={i18n}>
				<FindingHelp code={code} why="Readability" documentLocale="en-US" data={defaultResumeData} />
			</I18nProvider>,
		);
		expect(document.querySelector('[data-slot="rule-comparison"]')).toBeNull();
	},
);
it.each(["ar-SA", "en-US"] as const)("shows only actual values and localized controls in %s", async (locale) => {
	i18n.loadAndActivate(await getUiLocaleMessages(locale));
	const missing = vi.fn();
	const unsubscribe = i18n.on("missing", missing);
	try {
		render(
			<I18nProvider i18n={i18n}>
				<FindingHelp
					code="NON_STANDARD_SECTION_TITLE"
					why="Readable headings"
					documentLocale="ar-SA"
					data={defaultResumeData}
					proposal={{ path: ["title"], before: "قسم إضافي 1", after: "الدورات والشهادات" }}
				/>
			</I18nProvider>,
		);
		const comparison = document.querySelector('[data-slot="rule-comparison"]');
		expect(comparison).toHaveTextContent("قسم إضافي 1");
		expect(comparison).toHaveTextContent("الدورات والشهادات");
		expect(comparison).not.toHaveTextContent("رحلتي");
		await userEvent.click(screen.getByRole("button", { name: locale === "ar-SA" ? "لماذا يهم" : "Why it matters" }));
		expect(screen.getByText("Readable headings")).toBeVisible();
		expect(missing).not.toHaveBeenCalled();
	} finally {
		unsubscribe();
	}
});
