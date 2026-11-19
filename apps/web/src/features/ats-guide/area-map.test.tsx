import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { GuideAreaMap, getGuideHighlight } from "./area-map";
import { GUIDE_AREAS, loadGuideEntries } from "./model";
import { getUiLocaleMessages } from "@/libs/locale";

afterEach(() => {
	cleanup();
	document.querySelector("style[data-guide-map-test]")?.remove();
});

it.each(["pdf", "editor"] as const)("balances the %s map in target order", async (source) => {
	i18n.loadAndActivate(await getUiLocaleMessages("en-US"));
	const { container } = render(
		<I18nProvider i18n={i18n}>
			<GuideAreaMap
				entries={(await loadGuideEntries()).filter((entry) => entry.source === source)}
				selected={null}
				onSelect={vi.fn()}
			/>
		</I18nProvider>,
	);
	const counts = ["start", "end"].map((bank) => container.querySelectorAll(`[data-bank="${bank}"]`).length);
	expect(counts).toEqual(source === "pdf" ? [3, 3] : [3, 2]);
});

it.each(["en-US", "ar-SA"] as const)(
	"connects preview and selection without duplicating counts in %s",
	async (locale) => {
		i18n.loadAndActivate(await getUiLocaleMessages(locale));
		const entries = await loadGuideEntries();
		const onSelect = vi.fn();
		const { container, rerender } = render(
			<I18nProvider i18n={i18n}>
				<GuideAreaMap entries={entries} selected={null} onSelect={onSelect} />
			</I18nProvider>,
		);
		const contact = container.querySelector<HTMLButtonElement>('[data-guide-area="contact"]');
		expect(
			Array.from(container.querySelectorAll("[data-guide-area]"), (node) => node.getAttribute("data-guide-area")),
		).toEqual(["contact", "sections", "parseability", "layout", "content", "dates"]);
		for (const bank of ["start", "end"]) {
			const anchors = Array.from(container.querySelectorAll(`[data-bank="${bank}"]`), (node) => {
				const pin = container.querySelector(`[data-guide-pin="${node.getAttribute("data-guide-area")}"]`);
				return Number(pin?.getAttribute("cy"));
			});
			expect(anchors).toEqual([...anchors].sort((a, b) => a - b));
			expect(new Set(anchors).size).toBe(anchors.length);
		}
		if (!contact) throw new Error("Contact category is missing");
		expect(within(contact).queryByText("17")).toBeNull();
		expect(contact.querySelector('[data-guide-source="pdf"]')).toHaveTextContent("10");
		expect(contact.querySelector('[data-guide-source="editor"]')).toHaveTextContent("7");
		expect(contact.querySelector('[data-slot="badge"]')?.parentElement).toBe(contact.querySelector(".guide-node-name"));
		expect(contact).toHaveAttribute("aria-describedby");
		fireEvent.pointerEnter(contact, { pointerType: "mouse" });
		expect(container.querySelector('[data-guide-region="contact"]')).toHaveAttribute("data-active", "true");
		expect(container.querySelector('[data-guide-branch="contact"]')).toHaveAttribute("data-active", "true");
		const dates = container.querySelector<HTMLButtonElement>('[data-guide-area="dates"]');
		if (!dates) throw new Error("Dates category is missing");
		fireEvent.focus(dates);
		expect(container.querySelector('[data-guide-region="dates"]')).toHaveAttribute("data-active", "true");
		fireEvent.pointerLeave(contact);
		expect(container.querySelector('[data-guide-region="dates"]')).toHaveAttribute("data-active", "true");
		fireEvent.blur(dates);
		expect(container.querySelector('[data-guide-region="contact"]')).toHaveAttribute("data-active", "false");
		fireEvent.focus(contact);
		expect(container.querySelector('[data-guide-region="contact"]')).toHaveAttribute("data-active", "true");
		fireEvent.click(contact);
		expect(onSelect).toHaveBeenCalledWith("contact");
		rerender(
			<I18nProvider i18n={i18n}>
				<GuideAreaMap entries={entries} selected="contact" onSelect={onSelect} />
			</I18nProvider>,
		);
		fireEvent.blur(contact);
		expect(contact).toHaveAttribute("aria-pressed", "true");
		expect(container.querySelector('[data-guide-region="contact"]')).toHaveAttribute("data-active", "true");
		expect(screen.getAllByRole("button")).toHaveLength(6);
	},
);

it.each(["en-US", "ar-SA"] as const)("keeps every highlight equal to its complete CV band in %s", async (locale) => {
	const styles = document.createElement("style");
	styles.dataset.guideMapTest = "";
	const tokenStyles = readFileSync(new URL(import.meta.resolve("@reactive-resume/ui/globals.css")), "utf8");
	const mapStyles = readFileSync(resolve(import.meta.dirname, "area-map.css"), "utf8");
	styles.textContent = `${tokenStyles}\n${mapStyles}`;
	document.head.append(styles);
	i18n.loadAndActivate(await getUiLocaleMessages(locale));
	const { container } = render(
		<I18nProvider i18n={i18n}>
			<GuideAreaMap entries={await loadGuideEntries()} selected={null} onSelect={vi.fn()} />
		</I18nProvider>,
	);
	for (const area of GUIDE_AREAS) {
		const band = container.querySelector(`[data-guide-band="${area}"]`);
		const highlight = container.querySelector(`[data-guide-region="${area}"]`);
		expect(band, area).not.toBeNull();
		for (const attribute of ["x", "y", "width", "height", "rx"])
			expect(highlight?.getAttribute(attribute), `${area}.${attribute}`).toBe(band?.getAttribute(attribute));
		const node = container.querySelector(`[data-guide-area="${area}"]`);
		if (!node) throw new Error(`Missing category ${area}`);
		fireEvent.pointerEnter(node, { pointerType: "mouse" });
		expect(highlight).toHaveAttribute("data-active", "true");
	}
	expect(container.querySelector('[data-guide-band="parseability"]')).toHaveAttribute("height", "52");
	const sections = container.querySelector('[data-guide-band="sections"]');
	if (!sections) throw new Error("Missing sections band");
	const sectionHeight = getComputedStyle(document.documentElement).getPropertyValue("--space-16").trim();
	expect(sectionHeight).toBeTruthy();
	expect(getComputedStyle(sections).height).toBe(sectionHeight);
});

it("resolves every highlight to defined shared tokens, including whole-page nodes", () => {
	const css = readFileSync(new URL(import.meta.resolve("@reactive-resume/ui/globals.css")), "utf8");
	for (const area of GUIDE_AREAS) {
		const colors = getGuideHighlight(area);
		for (const variable of Object.values(colors).flatMap((value) =>
			[...value.matchAll(/var\((--[\w-]+)\)/g)].map((match) => match[1]),
		)) {
			expect(css, variable).toContain(`${variable}:`);
		}
		expect(colors.fill).not.toBe("none");
	}
	expect(getGuideHighlight("layout").fill).toContain("12%");
});
