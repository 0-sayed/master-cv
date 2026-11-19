// @vitest-environment happy-dom
import type { CareerMaster, MasterFactInput } from "@reactive-resume/schema/career-master";
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { careerSections, previewLimits } from "./presentation";
const state = vi.hoisted(() => ({
	query: {} as Record<string, unknown>,
	restored: null as { section: string; entityId: string } | null,
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => state.query }));
vi.mock("@/libs/orpc/client", () => ({ orpc: { career: { master: { read: { queryOptions: () => ({}) } } } } }));
vi.mock("@/components/layout/page-header", () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("@reactive-resume/ui/components/skeleton", async (importOriginal) => ({
	...(await importOriginal<typeof import("@reactive-resume/ui/components/skeleton")>()),
	useSkeletonLoading: (pending: boolean) => ({ pending }),
}));
vi.mock("../hooks", async () => {
	const { useState } = await import("react");
	return {
		useSessionDraft: () => {
			const [value, setValue] = useState(state.restored);
			return { value, setValue };
		},
	};
});
vi.mock("./profile-details", () => ({ CareerProfileDetails: () => null }));
vi.mock("./entry-dialog", () => ({
	CareerEntryDialog: ({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) => (
		<div role="dialog">
			<button onClick={onClose}>Cancel editor</button>
			<button onClick={onSaved}>Saved editor</button>
		</div>
	),
}));
vi.mock("./section-index", () => ({ CareerSectionIndex: () => <nav aria-label="Section navigation" /> }));
vi.mock("./usage-disclosure", () => ({ CareerUsageDisclosure: () => <button>In 3 CVs</button> }));
import { CareerInformationPage } from "./page";
function master(totals = [8, 3, 24, 3, 7]): CareerMaster {
	return {
		profileRevision: 1,
		links: [],
		sections: [],
		facts: careerSections.flatMap((section, sectionIndex) =>
			Array.from({ length: totals[sectionIndex] ?? 0 }, (_, index) => ({
				id: `${section}-${index}`,
				text: `${section} ${index}`,
				source: { kind: "manual" as const, id: "test", quote: "" },
				status: "active",
				confirmation: "confirmed" as const,
				revision: 1,
				draftRevision: 0,
				structured: {
					section,
					entityId: `${section}-${index}`,
					field:
						section === "experience"
							? "position"
							: section === "education"
								? "degree"
								: section === "skills"
									? "name"
									: section === "languages"
										? "language"
										: "title",
					value: `${section} ${index}`,
				} as MasterFactInput,
				proposedStructured: null,
			})),
		),
	};
}
function mount() {
	return render(
		<I18nProvider i18n={i18n}>
			<CareerInformationPage />
		</I18nProvider>,
	);
}
function section(name: string) {
	const element = document.getElementById(`career-section-${name}`);
	if (!element) throw new Error(`MISSING_SECTION_${name}`);
	return element;
}
beforeEach(() => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	state.restored = null;
	state.query = { data: master(), isPending: false, isError: false, isFetching: false, refetch: vi.fn() };
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
	HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});
it("bounds the five lists and keeps every section mounted", () => {
	mount();
	expect(careerSections.map((name) => within(section(name)).queryAllByRole("article").length)).toEqual([3, 2, 8, 3, 3]);
	expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(5);
});
it.each(careerSections.flatMap((name) => [-1, 0, 1].map((delta) => [name, delta] as const)))(
	"shows expansion only beyond the %s threshold (%s)",
	(name, delta) => {
		const totals = careerSections.map((key) => previewLimits[key] + (key === name ? delta : 0));
		state.query.data = master(totals);
		mount();
		expect(within(section(name)).queryByRole("button", { name: /Show all/ }) !== null).toBe(delta > 0);
	},
);
it("expands in stored order and restores focus on collapse", async () => {
	mount();
	const button = within(section("experience")).getByRole("button", { name: "Show all 8" });
	fireEvent.click(button);
	expect(
		within(section("experience"))
			.getAllByRole("article")
			.map((row) => row.getAttribute("aria-label")),
	).toEqual(Array.from({ length: 8 }, (_, index) => `experience ${index}`));
	fireEvent.click(within(section("experience")).getByRole("button", { name: "Show fewer" }));
	await waitFor(() => expect(document.activeElement).toBe(button));
	expect(within(section("experience")).getAllByRole("article")).toHaveLength(3);
});
it("reveals hidden pending entries without accepting or reordering them", async () => {
	const data = master();
	const pending = data.facts.find((fact) => fact.id === "experience-6");
	if (!pending) throw new Error("MISSING_TEST_FACT");
	pending.confirmation = "pending";
	state.query.data = data;
	const original = structuredClone(data);
	mount();
	fireEvent.click(within(section("experience")).getByRole("button", { name: "Review pending entries (1)" }));
	await waitFor(() => expect(document.activeElement?.id).toBe("career-entry-experience-experience-6"));
	expect(within(section("experience")).getAllByRole("article")).toHaveLength(8);
	expect(data).toEqual(original);
});
it("reveals restored drafts and returns focus after the editor closes", async () => {
	state.restored = { section: "experience", entityId: "experience-7" };
	mount();
	expect(within(section("experience")).getAllByRole("article")).toHaveLength(8);
	fireEvent.click(screen.getByRole("button", { name: "Cancel editor" }));
	await waitFor(() =>
		expect(document.activeElement?.closest("article")?.id).toBe("career-entry-experience-experience-7"),
	);
});
it("preserves expansion across retries, locale changes, edits and query updates", async () => {
	const view = mount();
	fireEvent.click(within(section("experience")).getByRole("button", { name: "Show all 8" }));
	fireEvent.click(screen.getByRole("button", { name: "Edit experience 0" }));
	fireEvent.click(screen.getByRole("button", { name: "Saved editor" }));
	state.query = { ...state.query, data: structuredClone(state.query.data), isError: true };
	view.rerender(
		<I18nProvider i18n={i18n}>
			<CareerInformationPage />
		</I18nProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Try again" }));
	expect(state.query.refetch).toHaveBeenCalled();
	expect(within(section("experience")).getAllByRole("article")).toHaveLength(8);
	i18n.loadAndActivate({ locale: "ar-SA", messages: {} });
	await waitFor(() => expect(within(section("experience")).getAllByRole("article")).toHaveLength(8));
});
it("returns focus to Add when the edited entry is removed", async () => {
	const data = master();
	state.query.data = data;
	const view = mount();
	fireEvent.click(screen.getByRole("button", { name: "Edit experience 0" }));
	data.facts = data.facts.filter((fact) => fact.id !== "experience-0");
	state.query.data = data;
	view.rerender(
		<I18nProvider i18n={i18n}>
			<CareerInformationPage />
		</I18nProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Saved editor" }));
	await waitFor(() =>
		expect(document.activeElement).toBe(within(section("experience")).getByRole("button", { name: /Add/ })),
	);
});
it("keeps the initial skeleton until data arrives", () => {
	state.query = { ...state.query, data: undefined, isPending: true };
	mount();
	expect(document.getElementById("career-section-experience")).not.toBeNull();
	expect(screen.getByRole("status")).toHaveTextContent("Loading");
	expect(screen.queryByRole("heading", { name: "Experience" })).toBeNull();
	expect(screen.queryByRole("button", { name: "Add experience" })).toBeNull();
	expect(screen.queryByRole("heading", { name: "No information added yet" })).toBeNull();
});
it("shows initial failure with Retry instead of a false empty state", () => {
	state.query = { ...state.query, data: undefined, isError: true };
	mount();
	expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
	expect(screen.queryByRole("heading", { name: "No information added yet" })).toBeNull();
});
it("keeps one Add action per successful empty section", () => {
	state.query.data = master([0, 0, 0, 0, 0]);
	mount();
	for (const name of careerSections) {
		expect(within(section(name)).getAllByRole("button", { name: /Add/ })).toHaveLength(1);
		expect(within(section(name)).getByText("No information added yet")).toBeDefined();
		expect(within(section(name)).getByText("Add your first entry to use it when you build a CV.")).toBeDefined();
	}
});

it("returns to Edit rather than CV usage for compact linked entries", async () => {
	const data = master();
	data.links = [{ resumeId: "cv-1", name: "Operations CV", factId: "skills-0", acceptedRevision: 1 }];
	state.query.data = data;
	mount();
	const edit = screen.getByRole("button", { name: "Edit skills 0" });
	fireEvent.click(edit);
	fireEvent.click(screen.getByRole("button", { name: "Cancel editor" }));
	await waitFor(() => expect(document.activeElement).toBe(edit));
});
