// @vitest-environment happy-dom
import type { CareerMaster } from "@reactive-resume/schema/career-master";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { createRef } from "react";
import { CareerUsageDisclosure } from "./usage-disclosure";
const state = vi.hoisted(() => ({ breakpoint: "desktop" }));
vi.mock("@reactive-resume/ui/hooks/use-breakpoint", () => ({ useBreakpoint: () => state.breakpoint }));
vi.mock("@tanstack/react-router", () => ({
	Link: ({ params, children, ...props }: { params: { resumeId: string }; children: React.ReactNode }) => (
		<a {...props} href={`/builder/${params.resumeId}`}>
			{children}
		</a>
	),
}));
beforeEach(() => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	state.breakpoint = "desktop";
});
afterEach(cleanup);
const names = [
	"A complete long CV name with تفاصيل محفوظة",
	"سيرة عربية طويلة",
	"Shared name",
	"Shared name",
	"English operations CV",
];
const documents: CareerMaster["links"] = names.map((name, index) => ({
	name,
	resumeId: `cv-${index}`,
	factId: `fact-${index}`,
	acceptedRevision: 1,
}));
function mount(links = documents) {
	const fallback = createRef<HTMLButtonElement>();
	return render(
		<I18nProvider i18n={i18n}>
			<button ref={fallback}>Add</button>
			<CareerUsageDisclosure documents={links} entryLabel="Operations Director" fallbackFocusRef={fallback} />
		</I18nProvider>,
	);
}
it("omits zero usage", () => {
	mount([]);
	expect(screen.queryByRole("button", { name: /In .* CV/ })).toBeNull();
});
it("counts unique CV IDs", () => {
	const first = documents[0];
	if (!first) throw new Error("MISSING_TEST_LINK");
	mount([...documents, { ...first, factId: "another-field" }]);
	expect(screen.getAllByRole("button", { name: "In 5 CVs" })).toHaveLength(1);
	expect(screen.queryByRole("link")).toBeNull();
});
it.each(["desktop", "mobile"])("opens every exact CV target with its full name on %s", async (breakpoint) => {
	state.breakpoint = breakpoint;
	mount();
	const trigger = screen.getByRole("button", { name: "In 5 CVs" });
	trigger.focus();
	fireEvent.click(trigger);
	await screen.findByRole("dialog", { name: "Linked CVs" });
	for (const [index, name] of names.entries()) {
		const link = screen
			.getAllByRole("link", { name: `Open CV ${name}` })
			.find((link) => link.getAttribute("href") === `/builder/cv-${index}`);
		expect(link?.textContent).toContain(name);
	}
	expect(screen.getByText("Operations Director")).toBeDefined();
	fireEvent.click(screen.getByRole("button", { name: "Close" }));
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	await waitFor(() => expect(document.activeElement).toBe(trigger));
});
it("closes on Escape and returns keyboard focus", async () => {
	mount();
	const trigger = screen.getByRole("button", { name: "In 5 CVs" });
	trigger.focus();
	fireEvent.click(trigger);
	await screen.findByRole("dialog");
	fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	await waitFor(() => expect(document.activeElement).toBe(trigger));
});
it("uses the surviving section action if its trigger disappears", async () => {
	mount();
	const trigger = screen.getByRole("button", { name: "In 5 CVs" });
	fireEvent.click(trigger);
	await screen.findByRole("dialog");
	const connected = vi.spyOn(trigger, "isConnected", "get").mockReturnValue(false);
	fireEvent.click(screen.getByRole("button", { name: "Close" }));
	await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add" })));
	connected.mockRestore();
});
