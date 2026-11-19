// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { careerSections } from "./presentation";
import { CareerSectionIndex } from "./section-index";
vi.mock("@reactive-resume/ui/hooks/use-breakpoint", () => ({ useBreakpoint: () => "mobile" }));
let observeUpdate: IntersectionObserverCallback;
const disconnect = vi.fn();
const scrollIntoView = vi.fn();
let tops = [0, 500, 1000, 1500, 2000];
beforeEach(() => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	tops = [0, 500, 1000, 1500, 2000];
	vi.stubGlobal(
		"IntersectionObserver",
		class {
			constructor(callback: IntersectionObserverCallback) {
				observeUpdate = callback;
			}
			observe() {}
			disconnect = disconnect;
		},
	);
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
		const index = careerSections.findIndex((section) => this.id === `career-heading-${section}`);
		const indexHeight = 48;
		return { top: tops[index] ?? 0, height: indexHeight } as DOMRect;
	});
	HTMLElement.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});
function mount() {
	return render(
		<I18nProvider i18n={i18n}>
			<main id="main-content">
				<CareerSectionIndex sections={careerSections.map((section, index) => ({ section, total: index + 1 }))} />
				{careerSections.map((section) => (
					<section key={section} id={`career-section-${section}`}>
						<h2 id={`career-heading-${section}`} tabIndex={-1}>
							{section} target
						</h2>
					</section>
				))}
			</main>
		</I18nProvider>,
	);
}
it("provides five ordered anchors with totals and an initial current location", () => {
	mount();
	const links = screen.getAllByRole("link");
	expect(links.map((link) => link.getAttribute("href"))).toEqual(
		careerSections.map((section) => `#career-section-${section}`),
	);
	expect(links[0]?.getAttribute("aria-current")).toBe("location");
	for (const [index, link] of links.entries()) expect(link.textContent).toContain(String(index + 1));
	expect(screen.getAllByRole("heading")).toHaveLength(5);
});
it("focuses the target heading without hiding any other section", () => {
	mount();
	fireEvent.click(screen.getByRole("link", { name: /Education/ }));
	expect(document.activeElement?.id).toBe("career-heading-education");
	expect(screen.getAllByRole("heading")).toHaveLength(5);
});
it("tracks scrolling in the dashboard root and cleans up", async () => {
	const view = mount();
	tops = [-900, -400, 30, 550, 1050];
	observeUpdate([], {} as IntersectionObserver);
	await waitFor(() =>
		expect(screen.getByRole("link", { name: /Skills/ }).getAttribute("aria-current")).toBe("location"),
	);
	view.unmount();
	expect(disconnect).toHaveBeenCalled();
});
it("keeps a scrollable logical index and respects reduced motion", () => {
	const media = vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
	mount();
	fireEvent.click(screen.getByRole("link", { name: /Languages/ }));
	expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: "instant", block: "start" }));
	expect(screen.getByRole("navigation").className).toContain("overflow-x-auto");
	media.mockRestore();
});

it("accounts for the shared toolbar offset when the mobile index is shorter", async () => {
	document.documentElement.style.setProperty("--app-toolbar-height", "64px");
	mount();
	tops = [-900, -400, 64, 550, 1050];
	observeUpdate([], {} as IntersectionObserver);
	await waitFor(() =>
		expect(screen.getByRole("link", { name: /Skills/ }).getAttribute("aria-current")).toBe("location"),
	);
	document.documentElement.style.removeProperty("--app-toolbar-height");
});
