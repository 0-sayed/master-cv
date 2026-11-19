// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { AI_GUIDE_FEATURES } from "./ai-features";
import { AiGuideMap } from "./ai-map";
import { getGuideHighlight } from "./area-map";
import { getUiLocaleMessages } from "@/libs/locale";

const query = vi.hoisted(() => ({ state: "not_enabled", error: null as Error | null, isPending: false }));
vi.mock("@tanstack/react-query", () => ({
	useQuery: () => ({
		data: { state: query.state },
		error: query.error,
		isPending: query.isPending,
		refetch: vi.fn(),
	}),
}));
vi.mock("@/libs/orpc/client", () => ({ orpc: { ai: { availability: { queryOptions: () => ({}) } } } }));
afterEach(() => {
	cleanup();
	query.state = "not_enabled";
	query.error = null;
	query.isPending = false;
});

it.each(["ar-SA", "en-US"] as const)(
	"shows nine real tools, consent and honest disabled availability in %s",
	async (locale) => {
		i18n.loadAndActivate(await getUiLocaleMessages(locale));
		const missing: string[] = [];
		const unsubscribe = i18n.on("missing", ({ id }) => missing.push(id));
		const { container } = render(
			<I18nProvider i18n={i18n}>
				<AiGuideMap />
			</I18nProvider>,
		);
		unsubscribe();
		expect(screen.getAllByRole("link")).toHaveLength(9);
		expect(["start", "end"].map((bank) => container.querySelectorAll(`[data-bank="${bank}"]`).length)).toEqual([5, 4]);
		expect(missing).toEqual([]);
		for (const bank of ["start", "end"]) {
			const pins = Array.from(container.querySelectorAll(`[data-bank="${bank}"]`), (node) =>
				Number(
					container.querySelector(`[data-guide-pin="${node.getAttribute("data-guide-area")}"]`)?.getAttribute("cy"),
				),
			);
			expect(pins).toEqual([...pins].sort((a, b) => a - b));
			expect(new Set(pins).size).toBe(pins.length);
		}
		for (const feature of AI_GUIDE_FEATURES) {
			const node = container.querySelector(`[data-guide-area="${feature.id}"]`);
			if (!node) throw new Error(`Missing ${feature.id}`);
			const region = container.querySelector(`[data-guide-region="${feature.id}"]`);
			expect(region?.closest("[data-guide-tone]")).toHaveAttribute("data-guide-tone", feature.area);
			fireEvent.focus(node);
			const highlight = getGuideHighlight(feature.area);
			expect((region as SVGElement).style.fill).toBe(highlight.fill);
			expect((region as SVGElement).style.stroke).toBe(highlight.stroke);
			expect(within(node as HTMLElement).getByText(i18n._(feature.description))).toBeVisible();
			const location = node.querySelector(".guide-node-location");
			if (feature.id === "review.interview-prep") {
				expect(location).toHaveTextContent(locale === "ar-SA" ? "غير متاح محليًا" : "Not available locally");
				expect(node).not.toHaveTextContent(i18n._(feature.location));
				fireEvent.focus(node);
				expect(await screen.findByRole("tooltip")).toHaveTextContent(i18n._(feature.location));
				fireEvent.blur(node);
			} else {
				const parts = i18n
					._(feature.location)
					.split(/[←→]/)
					.map((part) => part.trim());
				expect(Array.from(location?.querySelectorAll(".guide-path-segment") ?? [], (part) => part.textContent)).toEqual(
					parts,
				);
				const separators = location?.querySelectorAll("[data-guide-separator]") ?? [];
				expect(separators).toHaveLength(parts.length - 1);
				for (const separator of separators) {
					expect(separator).toHaveAttribute("aria-hidden", "true");
					expect(separator).toHaveAttribute("data-slot", "icon");
					expect(separator.previousElementSibling).toHaveClass("guide-path-segment");
					expect(separator).toHaveClass("rtl:-scale-x-100");
				}
			}
			expect(node.querySelector('[data-slot="icon"]')).not.toBeNull();
		}
		expect(screen.getAllByRole("listitem")).toHaveLength(3);
		expect(screen.getByRole("status")).toHaveTextContent(
			locale === "ar-SA" ? "المساعد غير مفعّل بعد" : "The assistant is not enabled yet",
		);
		const feature = container.querySelector('[data-guide-area="review.wording"]');
		if (!feature) throw new Error("Missing wording feature");
		fireEvent.focus(feature);
		expect(container.querySelector('[data-guide-branch="review.wording"]')).toHaveAttribute("data-active", "true");
		expect(container.querySelector('[data-guide-region="review.wording"]')).toHaveAttribute("data-active", "true");
		expect(container.textContent).not.toMatch(/GPT|OpenAI|Azure|verification|تحقق داخلي|\$/i);
	},
);
it("does not present unavailable or unknown availability as enabled", async () => {
	i18n.loadAndActivate(await getUiLocaleMessages("en-US"));
	query.error = new Error("Offline");
	render(
		<I18nProvider i18n={i18n}>
			<AiGuideMap />
		</I18nProvider>,
	);
	expect(screen.getByRole("status")).toHaveTextContent("The assistant is unavailable now");
	expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
});
