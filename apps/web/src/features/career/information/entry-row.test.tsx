// @vitest-environment happy-dom
import type { CareerEntryView } from "./presentation";
import type { MasterFactInput } from "@reactive-resume/schema/career-master";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { CareerEntryRow } from "./entry-row";

let fullHeight = 80;
let resize: ResizeObserverCallback;
const disconnect = vi.fn();
beforeEach(() => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	fullHeight = 80;
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
		return { height: this.classList.contains("line-clamp-2") ? 40 : fullHeight } as DOMRect;
	});
	vi.stubGlobal(
		"ResizeObserver",
		class {
			constructor(callback: ResizeObserverCallback) {
				resize = callback;
			}
			observe() {}
			disconnect = disconnect;
		},
	);
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});
function entry(section: CareerEntryView["section"], fields: Record<string, string>): CareerEntryView {
	return {
		section,
		entityId: "record",
		documents: [],
		needsReview: false,
		facts: Object.entries(fields).map(([field, value]) => ({
			id: field,
			text: value,
			source: { kind: "manual", id: "test", quote: "" },
			status: "active",
			confirmation: "confirmed",
			revision: 1,
			draftRevision: 0,
			structured: { section, entityId: "record", field, value } as MasterFactInput,
			proposedStructured: null,
		})),
	};
}
function row(value: CareerEntryView, expanded = false, change = vi.fn()) {
	return render(
		<I18nProvider i18n={i18n}>
			<CareerEntryRow
				entry={value}
				descriptionExpanded={expanded}
				onDescriptionExpandedChange={change}
				onEdit={vi.fn()}
				usage={<span>Usage</span>}
			/>
		</I18nProvider>,
	);
}
it.each([
	[
		"experience",
		{ position: "Director", company: "Company", location: "Riyadh", dates: "2006–2026", description: "Details" },
	],
	[
		"education",
		{
			degree: "Degree",
			school: "School",
			area: "Engineering",
			grade: "Distinction",
			dates: "2006",
			location: "Jeddah",
			description: "Details",
		},
	],
	["skills", { name: "Leadership", proficiency: "Advanced" }],
	["languages", { language: "Arabic", fluency: "Native" }],
	["certifications", { title: "Certificate", issuer: "Institute", dates: "2024", description: "Details" }],
] as const)("keeps essential %s fields readable", (section, fields) => {
	row(entry(section, fields));
	for (const text of Object.values(fields)) expect(screen.getByText(text)).toBeDefined();
	expect(screen.getByRole("button", { name: /^Edit / })).toBeDefined();
});
it("shows accepted text during pending edits and provides a heading fallback", () => {
	const value = entry("experience", { company: "Accepted company" });
	const accepted = value.facts[0];
	if (!accepted) throw new Error("MISSING_TEST_FACT");
	accepted.proposedStructured = {
		section: "experience",
		entityId: "record",
		field: "company",
		value: "Proposed company",
		source: { kind: "manual", id: "test", quote: "" },
	};
	row(value);
	expect(screen.getByRole("heading", { name: "Accepted company" })).toBeDefined();
	expect(screen.queryByText("Proposed company")).toBeNull();
});
it("shows expansion only when full description height exceeds its two-line height", async () => {
	const value = entry("experience", { position: "Director", description: "Long description" });
	const change = vi.fn();
	const view = row(value, false, change);
	await waitFor(() => expect(screen.getByRole("button", { name: "See more" })).toBeDefined());
	fireEvent.click(screen.getByRole("button", { name: "See more" }));
	expect(change).toHaveBeenCalledWith(true);
	view.rerender(
		<I18nProvider i18n={i18n}>
			<CareerEntryRow
				entry={value}
				descriptionExpanded
				onDescriptionExpandedChange={change}
				onEdit={vi.fn()}
				usage={null}
			/>
		</I18nProvider>,
	);
	expect(screen.getByRole("button", { name: "See less" }).getAttribute("aria-expanded")).toBe("true");
	expect(screen.getByText("Long description").classList.contains("line-clamp-2")).toBe(false);
	resize([], {} as ResizeObserver);
	expect(screen.getByRole("button", { name: "See less" })).toBeDefined();
});
it.each(["", "   ", "Fits"])("omits expansion for fitting or empty descriptions: %s", async (description) => {
	fullHeight = 40;
	row(entry("certifications", { title: "شهادة", description }));
	await Promise.resolve();
	expect(screen.queryByRole("button", { name: "See more" })).toBeNull();
});
it("remeasures after fonts finish and disconnects its observer", async () => {
	const fonts = new EventTarget();
	Object.assign(fonts, { ready: Promise.resolve() });
	Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
	fullHeight = 40;
	const view = row(entry("experience", { position: "Director", description: "Details" }));
	await Promise.resolve();
	fullHeight = 80;
	fonts.dispatchEvent(new Event("loadingdone"));
	await waitFor(() => expect(screen.getByRole("button", { name: "See more" })).toBeDefined());
	view.unmount();
	expect(disconnect).toHaveBeenCalled();
});

it.each(["experience", "education"] as const)("uses the title start edge without a redundant %s initial", (section) => {
	const fields =
		section === "experience" ? { position: "Director", company: "Company" } : { degree: "Degree", school: "School" };
	const view = row(entry(section, fields));
	expect(view.container.querySelector("h3")?.parentElement?.previousElementSibling).toBeNull();
});
