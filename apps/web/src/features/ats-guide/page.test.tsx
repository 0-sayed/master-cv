// @vitest-environment happy-dom
import type { GuideEntry } from "./model";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { DirectionProvider } from "@base-ui/react/direction-provider";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { AI_GUIDE_FEATURES } from "./ai-features";
import { guideCopy } from "./copy";
import { reviewGuideSearch } from "./links";
import { loadGuideEntries } from "./model";
import { AtsGuidePage, AtsGuideError, AtsGuidePending } from "./page";
import { GuideRuleList } from "./rule-list";
import { getUiLocaleMessages } from "@/libs/locale";
vi.mock("./ai-map", () => ({ AiGuideMap: () => <div id="review-guide-description">AI map</div> }));
vi.mock("@/features/locale/provider", () => ({ useUiLocale: () => ({ locale: i18n.locale, pending: false }) }));
let entries: readonly GuideEntry[];
beforeEach(async () => {
	i18n.loadAndActivate(await getUiLocaleMessages("en-US"));
	entries = await loadGuideEntries();
});
afterEach(cleanup);
it.each(["en-US", "ar-SA"] as const)("renders catalog-backed segmented tabs and descriptions in %s", async (locale) => {
	i18n.loadAndActivate(await getUiLocaleMessages(locale));
	const missing: string[] = [];
	const unsubscribe = i18n.on("missing", ({ id }) => missing.push(id));
	try {
		await mount();
		const list = screen.getByRole("tablist");
		expect(list).toHaveAttribute("data-variant", "default");
		expect(list).toHaveAttribute("data-size", "page");
		const tabs = within(list).getAllByRole("tab");
		for (const [index, count] of [77, 22, AI_GUIDE_FEATURES.length].entries()) {
			const tab = tabs[index];
			if (!tab) throw new Error("Missing guide tab");
			expect(tab.querySelector('[data-slot="tabs-count"]')).toHaveTextContent(String(count));
			fireEvent.click(tab);
			await waitFor(() => expect(tab).toHaveAttribute("aria-selected", "true"));
			expect(screen.getByRole("tabpanel")).toHaveAccessibleDescription();
		}
		expect(missing).toEqual([]);
	} finally {
		unsubscribe();
	}
});
it.each(["en-US", "ar-SA"] as const)(
	"uses data warning labels and filters without an ATS score in %s",
	async (locale) => {
		i18n.loadAndActivate(await getUiLocaleMessages(locale));
		await mount("?tab=data");
		expect(screen.queryByRole("radio", { name: locale === "ar-SA" ? /^عائق/ : /^Blocker/ })).toBeNull();
		fireEvent.click(screen.getByRole("radio", { name: locale === "ar-SA" ? /^تحذير/ : /^Warning/ }));
		const email = document.getElementById("rule-MISSING_EMAIL");
		if (!email) throw new Error("Missing email rule");
		expect(within(email).getByText(i18n._(guideCopy.editorWarning))).toBeInTheDocument();
		expect(within(email).getByText(i18n._(guideCopy.editorEffect))).toBeInTheDocument();
		fireEvent.click(screen.getByRole("radio", { name: locale === "ar-SA" ? /^نصيحة/ : /^Tip/ }));
		expect(document.getElementById("rule-MISSING_EMAIL")).toBeNull();
		expect(screen.getByRole("radio", { name: locale === "ar-SA" ? /^نصيحة/ : /^Tip/ })).toBeInTheDocument();
	},
);
async function mount(hash = "", loader: () => Promise<readonly GuideEntry[]> = async () => entries) {
	const root = createRootRoute({
		component: () => (
			<I18nProvider i18n={i18n}>
				<DirectionProvider direction={i18n.locale === "ar-SA" ? "rtl" : "ltr"}>
					<div aria-label="Dashboard shell">
						<Outlet />
					</div>
				</DirectionProvider>
			</I18nProvider>
		),
	});
	const route = createRoute({
		getParentRoute: () => root,
		path: "/dashboard/review-guide",
		validateSearch: reviewGuideSearch,
		loader,
		component: () => <AtsGuidePage entries={route.useLoaderData()} />,
		errorComponent: AtsGuideError,
		pendingComponent: AtsGuidePending,
		pendingMs: 0,
		pendingMinMs: 0,
	});
	const router = createRouter({
		routeTree: root.addChildren([route]),
		history: createMemoryHistory({ initialEntries: [`/dashboard/review-guide${hash}`] }),
	});
	await act(async () => {
		await router.load();
	});
	render(<RouterProvider router={router} />);
	return router;
}
it.each(["en-US", "ar-SA"] as const)("uses direction-aware arrow keys and URL history in %s", async (locale) => {
	i18n.loadAndActivate(await getUiLocaleMessages(locale));
	const router = await mount("?tab=ats");
	const tabs = screen.getAllByRole("tab");
	tabs[0]?.focus();
	await userEvent.keyboard(locale === "ar-SA" ? "{ArrowLeft}{Enter}" : "{ArrowRight}{Enter}");
	await waitFor(() => expect(router.state.location.search.tab).toBe("data"));
	expect(tabs[1]).toHaveFocus();
	expect(screen.getByRole("tabpanel")).toHaveAccessibleDescription(i18n._(guideCopy.dataDescription));
	await act(async () => {
		router.history.back();
	});
	await waitFor(() => expect(router.state.location.search.tab).toBe("ats"));
});
it("changes URL tabs from the keyboard and preserves rule query deep links", async () => {
	const router = await mount("?rule=MISSING_EMAIL&tab=ats");
	await waitFor(() => expect(router.state.location.search.tab).toBe("data"));
	expect(router.state.location.search.rule).toBe("MISSING_EMAIL");
	expect((document.getElementById("rule-MISSING_EMAIL") as HTMLDetailsElement)?.open).toBe(true);
	screen.getByRole("tab", { name: "Data check" }).focus();
	await userEvent.keyboard("{End}{Enter}");
	await waitFor(() => expect(router.state.location.search.tab).toBe("ai"));
	expect(router.state.location.search.rule).toBeUndefined();
	expect(screen.getByRole("tab", { name: "AI" })).toHaveFocus();
	await userEvent.keyboard("{Home}{Enter}");
	await waitFor(() => expect(router.state.location.search.tab).toBe("ats"));
});
it("starts with all ATS rules and a captioned equivalent table", async () => {
	await mount();
	expect(screen.getByRole("heading", { name: "Rules: All areas" })).toBeInTheDocument();
	expect(screen.getAllByRole("button", { name: /rules$/ }).length).toBe(6);
	expect(screen.getAllByRole("radio")).toHaveLength(4);
	fireEvent.click(screen.getByRole("button", { name: "Show as table" }));
	expect(screen.getByRole("table")).toHaveAccessibleName("Checks by CV area");
	expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(8);
});
it("selects a branch, focuses results and restores branch focus on Escape", async () => {
	await mount();
	const branch = screen.getByRole("button", { name: /Contact.*10 rules/ });
	fireEvent.click(branch);
	await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Rules: Contact" })));
	fireEvent.keyDown(document, { key: "Escape" });
	await waitFor(() => expect(document.activeElement).toBe(branch));
	expect(screen.getByRole("heading", { name: "Rules: All areas" })).toBeInTheDocument();
});
it("searches both languages globally, filters by source, and resets empty results", async () => {
	await mount("?tab=data");
	fireEvent.click(screen.getByRole("button", { name: /Contact.*7 rules/ }));
	const search = screen.getByRole("searchbox");
	fireEvent.change(search, { target: { value: "MISSING_EMAIL" } });
	expect(screen.getByRole("heading", { name: "Rules: Contact" })).toBeInTheDocument();
	expect(document.getElementById("rule-MISSING_EMAIL")).toBeInTheDocument();
	fireEvent.click(screen.getByRole("radio", { name: /^Tip/ }));
	expect(screen.getByText("No matching checks")).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
	expect(search).toHaveValue("");
	fireEvent.change(search, { target: { value: entries.find((e) => e.code === "MISSING_EMAIL")?.text["ar-SA"].title } });
	expect(document.getElementById("rule-MISSING_EMAIL")).toBeInTheDocument();
	fireEvent.keyDown(document, { key: "Escape" });
	await waitFor(() => expect(document.activeElement).toBe(search));
});
it.each(["NO_EMAIL", "MISSING_EMAIL"])("opens, scrolls and focuses %s on initial navigation", async (code) => {
	const scroll = vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
	await mount(`#rule-${code}`);
	const summary = document.querySelector(`#rule-${code} summary`);
	await waitFor(() => expect(document.activeElement).toBe(summary));
	expect(summary?.closest("details")?.open).toBe(true);
	expect(scroll).toHaveBeenCalled();
	scroll.mockRestore();
});
it("keeps search focus after following a rule link", async () => {
	await mount("#rule-NO_EMAIL");
	const search = screen.getByRole("searchbox");
	search.focus();
	fireEvent.change(search, { target: { value: "NO_EMAIL" } });
	await waitFor(() => expect(search).toHaveFocus());
});
it("follows changed hashes and browser history and reopens a collapsed current rule", async () => {
	const router = await mount("#rule-NO_EMAIL");
	await act(async () => {
		await router.navigate({ hash: "rule-MISSING_EMAIL" });
	});
	await waitFor(() =>
		expect(
			document.querySelector("#rule-MISSING_EMAIL details") ?? document.getElementById("rule-MISSING_EMAIL"),
		).toBeInTheDocument(),
	);
	const row = document.getElementById("rule-MISSING_EMAIL") as HTMLDetailsElement;
	await act(async () => {
		row.open = false;
		fireEvent(row, new Event("toggle"));
	});
	const summary = row.querySelector("summary");
	if (!summary) throw new Error("Missing rule summary");
	fireEvent.click(summary);
	await waitFor(() => expect(row.open).toBe(true));
	await act(async () => {
		router.history.back();
	});
	await waitFor(() => expect((document.getElementById("rule-NO_EMAIL") as HTMLDetailsElement)?.open).toBe(true));
	await act(async () => {
		router.history.forward();
	});
	await waitFor(() => expect((document.getElementById("rule-MISSING_EMAIL") as HTMLDetailsElement)?.open).toBe(true));
});
it.each(["#rule-%", "#rule-UNKNOWN"])("recovers from invalid anchor %s", async (hash) => {
	await mount(hash);
	expect(screen.getByRole("alert")).toHaveTextContent("This check link is unavailable");
	fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
	expect(screen.queryByRole("alert")).toBeNull();
});
it("leaves Escape to an open menu or dialog", async () => {
	await mount("#rule-NO_EMAIL");
	const dialog = document.createElement("dialog");
	dialog.setAttribute("open", "");
	document.body.append(dialog);
	fireEvent.keyDown(document, { key: "Escape" });
	expect((document.getElementById("rule-NO_EMAIL") as HTMLDetailsElement).open).toBe(true);
	dialog.remove();
});
it("keeps a real catalog-load error separate from empty search and retries within the shell", async () => {
	const failure = new Error("Locale chunk unavailable");
	let fail = true;
	const router = await mount("", async () => {
		if (fail) throw failure;
		return loadGuideEntries();
	});
	expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the review guide");
	expect(screen.getByLabelText("Dashboard shell")).toBeInTheDocument();
	fail = false;
	fireEvent.click(screen.getByRole("button", { name: "Try again" }));
	await waitFor(() => expect(screen.getByRole("heading", { name: "Review guide" })).toBeInTheDocument());
	expect(router.state.status).toBe("idle");
});
it("announces pending catalogs without claiming an empty result", () => {
	render(
		<I18nProvider i18n={i18n}>
			<AtsGuidePending />
		</I18nProvider>,
	);
	expect(screen.getByRole("status")).toHaveTextContent("Loading review guide");
	expect(screen.queryByText("No matching checks")).toBeNull();
});

it.each(["en-US", "ar-SA"] as const)("shows named sources and catalog totals in %s", async (locale) => {
	i18n.loadAndActivate(await getUiLocaleMessages(locale));
	entries = entries.filter((entry) => entry.code !== "NO_EMAIL");
	await mount();
	fireEvent.click(screen.getByRole("button", { name: locale === "ar-SA" ? "عرض كجدول" : "Show as table" }));
	const table = screen.getByRole("table");
	const total = within(table).getByRole("row", { name: locale === "ar-SA" ? "المجموع 76" : "Total 76" });
	expect(total.parentElement?.tagName).toBe("TFOOT");
	expect(
		within(table).getByRole("columnheader", { name: locale === "ar-SA" ? "فحص ATS" : "ATS check" }),
	).toBeInTheDocument();
});

it.each(["en-US", "ar-SA"] as const)("groups rule guidance and copies its stable link in %s", async (locale) => {
	i18n.loadAndActivate(await getUiLocaleMessages(locale));
	const writeText = vi.fn().mockResolvedValue(undefined);
	vi.stubGlobal("navigator", { clipboard: { writeText } });
	try {
		await mount("#rule-NO_PHONE");
		const rule = document.getElementById("rule-NO_PHONE");
		if (!rule) throw new Error("Missing phone rule");
		const label = locale === "ar-SA" ? "نسخ رابط هذا الفحص" : "Copy link to this check";
		fireEvent.click(within(rule).getByRole("button", { name: label }));
		await waitFor(() =>
			expect(writeText).toHaveBeenCalledWith(
				expect.stringContaining("/dashboard/review-guide?tab=ats&locale=" + locale + "#rule-NO_PHONE"),
			),
		);
		const points = rule.querySelector("[data-guide-effect]");
		if (!points) throw new Error("Missing score effect");
		expect(points.textContent?.replace(/[\u2066-\u2069]/g, "")).toBe(
			locale === "ar-SA" ? "−15 نقطة من الفئة" : "−15 category points",
		);
		expect(points.tagName).toBe("BDI");
		expect(points).toHaveAttribute("dir", locale === "ar-SA" ? "rtl" : "ltr");
		expect(points.textContent).not.toMatch(/[٠-٩۰-۹]/);
		const content = rule.querySelector('[data-slot="disclosure-content"]');
		if (!content) throw new Error("Missing rule guidance");
		expect(content.querySelectorAll('[data-slot="rule-comparison"]')).toHaveLength(1);
		expect(content.textContent).not.toMatch(/Illustration only|مثال توضيحي فقط/);
		expect(content.querySelector('[data-slot="rule-detail"]')).toHaveAttribute(
			"dir",
			locale === "ar-SA" ? "rtl" : "ltr",
		);
	} finally {
		vi.unstubAllGlobals();
	}
});

it("reports a blocked clipboard without claiming that the link copied", async () => {
	const writeText = vi.fn().mockRejectedValue(new Error("Clipboard blocked"));
	vi.stubGlobal("navigator", { clipboard: { writeText } });
	try {
		await mount("#rule-NO_PHONE");
		const rule = document.getElementById("rule-NO_PHONE");
		if (!rule) throw new Error("Missing phone rule");
		await waitFor(() => expect(rule).toHaveAttribute("open"));
		fireEvent.click(within(rule).getByRole("button", { name: "Copy link to this check" }));
		await waitFor(() =>
			expect(within(rule).getByRole("status")).toHaveTextContent("Could not copy the link. Try again."),
		);
		expect(within(rule).queryByText("Link copied")).toBeNull();
		expect(rule).toHaveAttribute("open");
	} finally {
		vi.unstubAllGlobals();
	}
});

it.each(["en-US", "ar-SA"] as const)(
	"shows score effects and paired examples for the complete catalog in %s",
	async (locale) => {
		i18n.loadAndActivate(await getUiLocaleMessages(locale));
		const missing = vi.fn();
		const unsubscribe = i18n.on("missing", missing);
		const { container } = render(
			<I18nProvider i18n={i18n}>
				<GuideRuleList entries={entries} openCodes={new Set(entries.map((entry) => entry.code))} onToggle={vi.fn()} />
			</I18nProvider>,
		);
		for (const entry of entries) {
			const row = container.querySelector(`[id="rule-${entry.code}"]`);
			if (!row) throw new Error(`Missing rule ${entry.code}`);
			const effect = row.querySelector("[data-guide-effect]")?.textContent?.replace(/[\u2066-\u2069]/g, "");
			if (entry.source === "editor")
				expect(effect).toBe(locale === "ar-SA" ? "لا يؤثر في درجة فحص ATS." : "No ATS score effect.");
			else if (entry.cap !== null) expect(effect).toContain(String(entry.cap));
			else if (entry.deduction > 0)
				expect(effect).toBe(`−${entry.deduction} ${locale === "ar-SA" ? "نقطة من الفئة" : "category points"}`);
			else expect(effect).toBe(locale === "ar-SA" ? "دون خصم" : "No deduction");
			expect(row.querySelectorAll('[data-slot="rule-comparison"]')).toHaveLength(1);
			expect(row).toHaveTextContent(entry.text[locale].before);
			expect(row).toHaveTextContent(entry.text[locale].after);
			const button = within(row as HTMLElement).getByRole("button", {
				name: locale === "ar-SA" ? "نسخ رابط هذا الفحص" : "Copy link to this check",
			});
			expect(button.closest("summary")).toBeNull();
		}
		expect(container.textContent).not.toMatch(/Illustration only|مثال توضيحي فقط/);
		unsubscribe();
		expect(missing).not.toHaveBeenCalled();
	},
);

it.each(["en-US", "ar-SA"] as const)("keeps tab URL state and catalogs separate in %s", async (locale) => {
	i18n.loadAndActivate(await getUiLocaleMessages(locale));
	const router = await mount();
	const data = screen.getByRole("tab", { name: locale === "ar-SA" ? "فحص البيانات" : "Data check" });
	fireEvent.click(data);
	await waitFor(() => expect(router.state.location.search.tab).toBe("data"));
	expect(data).toHaveAttribute("aria-selected", "true");
	const contact = document.querySelector('[data-guide-area="contact"]') as HTMLElement;
	expect(contact.querySelector('[data-guide-source="pdf"]')).toBeNull();
	expect(contact.querySelector('[data-guide-source="editor"]')).toHaveTextContent("7");
	fireEvent.click(contact);
	expect(document.getElementById("rule-MISSING_EMAIL")).toBeInTheDocument();
	expect(document.getElementById("rule-NO_PHONE")).toBeNull();
	fireEvent.click(screen.getByRole("tab", { name: locale === "ar-SA" ? "الذكاء الاصطناعي" : "AI" }));
	await waitFor(() => expect(router.state.location.search.tab).toBe("ai"));
	expect(screen.getByText("AI map")).toBeInTheDocument();
	await act(async () => {
		router.history.back();
	});
	await waitFor(() => expect(router.state.location.search.tab).toBe("data"));
});

it.each(["en-US", "ar-SA"] as const)("names each rule family once in %s", async (locale) => {
	i18n.loadAndActivate(await getUiLocaleMessages(locale));
	await mount("#rule-NO_PHONE");
	const summary = document.querySelector("#rule-NO_PHONE summary") as HTMLElement;
	expect(within(summary).getAllByText(locale === "ar-SA" ? /فحص ATS/ : /ATS check/)).toHaveLength(1);
});

it.each(["ats", "data"] as const)(
	"combines category, severity and search and clears each filter in %s",
	async (tab) => {
		await mount(`?tab=${tab}`);
		const total = tab === "ats" ? 77 : 22;
		expect(document.querySelectorAll("details[id^=rule-]")).toHaveLength(total);
		expect(screen.getByRole("status")).toHaveTextContent(`${total} rules`);
		fireEvent.click(screen.getByRole("radio", { name: /^Warning/ }));
		const warningCount = document.querySelectorAll("details[id^=rule-]").length;
		expect(warningCount).toBeGreaterThan(0);
		expect(warningCount).toBeLessThan(total);
		fireEvent.click(screen.getByRole("radio", { name: /^All/ }));
		expect(document.querySelectorAll("details[id^=rule-]")).toHaveLength(total);
		fireEvent.change(screen.getByRole("searchbox"), { target: { value: "PHONE" } });
		fireEvent.click(screen.getByRole("radio", { name: /^Warning/ }));
		fireEvent.click(screen.getByRole("button", { name: /Contact.*rules/ }));
		expect(screen.getByRole("searchbox")).toHaveValue("PHONE");
		expect(screen.getByRole("radio", { name: /^Warning/ })).toHaveAttribute("aria-checked", "true");
		expect(document.getElementById(tab === "ats" ? "rule-NO_PHONE" : "rule-MISSING_PHONE")).toBeInTheDocument();
		const pill = screen.getByRole("button", { name: "Showing: Contact" });
		fireEvent.change(screen.getByRole("searchbox"), {
			target: { value: tab === "ats" ? "NO_EMAIL" : "MISSING_EMAIL" },
		});
		fireEvent.click(screen.getByRole("radio", { name: tab === "ats" ? /^Blocker/ : /^Warning/ }));
		expect(document.querySelectorAll("details[id^=rule-]")).toHaveLength(1);
		expect(screen.getByRole("status")).toHaveTextContent("1 rules");
		fireEvent.click(screen.getByRole("radio", { name: /^Tip/ }));
		expect(screen.getByText("No matching checks")).toBeInTheDocument();
		expect(screen.getByRole("status")).toHaveTextContent("0 rules");
		fireEvent.click(pill);
		expect(screen.queryByRole("button", { name: "Showing: Contact" })).toBeNull();
		expect(screen.getByRole("searchbox")).not.toHaveValue("");
		expect(screen.getByRole("radio", { name: /^Tip/ })).toHaveAttribute("aria-checked", "true");
		fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
		expect(screen.getByRole("searchbox")).toHaveValue("");
		expect(document.querySelectorAll("details[id^=rule-]")).toHaveLength(total);
	},
);
