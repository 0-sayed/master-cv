// @vitest-environment happy-dom
import type { Application } from "../types";
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { messages as arabicMessages } from "../../../../locales/ar-SA.po";
import { ApplicationInsights } from "./insights-view";
const documents = vi.hoisted(() => ({
	data: [] as unknown[] | undefined,
	isError: false,
	isPending: false,
	isFetching: false,
	refetch: vi.fn(),
}));
const exportPng = vi.hoisted(() => vi.fn<() => Promise<void>>());
vi.mock("../insights-export", () => ({ exportFunnelPng: exportPng }));
vi.mock("@/libs/orpc/client", () => ({ orpc: { documents: { list: { queryOptions: () => ({}) } } } }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => documents }));
vi.mock("@/features/career/shared", () => ({ useNow: () => new Date("2026-11-18T09:00:00Z") }));
beforeEach(() => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	documents.data = [];
	documents.isError = false;
	documents.isPending = false;
});
afterEach(cleanup);
const jobs = (count: number, status: Application["status"] = "interview"): Application[] =>
	Array.from(
		{ length: count },
		(_, index) =>
			({
				id: `app-${index}`,
				status,
				source: `Source ${index}`,
				closedReason: null,
				resumeId: "base",
				appliedAt: new Date("2026-11-01T09:00:00Z"),
				createdAt: new Date("2026-11-01T09:00:00Z"),
				activity:
					status === "saved"
						? []
						: [
								{ id: `sent-${index}`, type: "stage", stage: "applied", at: new Date("2026-11-01T09:00:00Z") },
								{ id: `reply-${index}`, type: "stage", stage: "interview", at: new Date("2026-11-03T09:00:00Z") },
							],
			}) as Application,
	);
const show = (applications: Application[]) =>
	render(
		<I18nProvider i18n={i18n}>
			<ApplicationInsights applications={applications} />
		</I18nProvider>,
	);
it("renders three summaries, one historical funnel and eight weeks", () => {
	const { container } = show(jobs(6));
	expect(container.querySelectorAll("dl > div")).toHaveLength(3);
	expect(screen.getByRole("heading", { name: "How far applications get" })).toBeVisible();
	expect(container.querySelectorAll('[data-slot="insight-week"]')).toHaveLength(8);
	expect(screen.getByRole("heading", { name: "Where applications come from" })).toBeVisible();
	expect(screen.getByRole("heading", { name: "What happened after an interview?" })).toBeVisible();
	expect(screen.queryByLabelText("Pipeline flow")).toBeNull();
});
it.each(["ar-SA", "en-US"])("uses distinct funnel colors and readable %s counts", (locale) => {
	i18n.loadAndActivate({ locale, messages: locale === "ar-SA" ? arabicMessages : {} });
	const { container } = show(jobs(6));
	const card = container.querySelector('[aria-labelledby="insights-funnel"]');
	if (!card) throw new Error("The funnel card is missing");
	const fills = [...(card?.querySelectorAll<HTMLElement>('[data-slot="insight-bar-fill"]') ?? [])];
	expect(fills.every((fill) => fill.classList.contains("bg-(--insight-bar-color)"))).toBe(true);
	const tokens = readFileSync(new URL(import.meta.resolve("@reactive-resume/ui/globals.css")), "utf8");
	const colors = ["applied", "screening", "interview", "offer"].map(
		(stage) => tokens.match(new RegExp(`--stage-${stage}:\\s*([^;]+);`))?.[1],
	);
	expect(new Set(colors).size).toBe(4);
	expect(fills.map((fill) => fill.style.getPropertyValue("--insight-bar-color"))).toEqual(colors);
	expect([...card.querySelectorAll('bdi[dir="ltr"]')].some((value) => value.textContent === "6 · 100%")).toBe(true);
});
it.each(["ar-SA", "en-US"])("keeps each %s summary value and caption inside its own definition", (locale) => {
	i18n.loadAndActivate({ locale, messages: locale === "ar-SA" ? arabicMessages : {} });
	const applications = jobs(18).map((application, index) => ({
		...application,
		status: index < 11 ? ("interview" as const) : ("applied" as const),
		activity:
			index < 11
				? application.activity.map((entry) => ({
						...entry,
						at: new Date(
							entry.type === "stage" && entry.stage === "interview" ? "2026-11-07T09:00:00Z" : "2026-11-01T09:00:00Z",
						),
					}))
				: application.activity.slice(0, 1),
	}));
	const { container } = show([
		...applications,
		...jobs(2, "saved").map((application) => ({ ...application, id: `saved-${application.id}` })),
	]);
	const blocks = [...container.querySelectorAll("[data-slot=insights-summary] > div")];
	expect(blocks).toHaveLength(3);
	for (const [index, value] of ["18", "61%", locale === "ar-SA" ? "6 أيام" : "6 days"].entries()) {
		const block = blocks[index];
		if (!block) throw new Error("The summary block is missing");
		expect(block).toHaveClass("text-start");
		expect(block.querySelectorAll(":scope > dt")).toHaveLength(1);
		expect(block.querySelectorAll(":scope > dd")).toHaveLength(1);
		expect(block.querySelector("dd > bdi")).toHaveTextContent(value);
		expect(block.querySelector("dd")).not.toHaveAttribute("dir", "ltr");
		expect(block.querySelector("dd p")).not.toBeNull();
	}
	expect(blocks[0]?.querySelector("dd p")).toHaveTextContent(locale === "ar-SA" ? "20 وظيفة مسجلة" : "20 tracked jobs");
	expect(blocks[1]?.querySelector("dd p")).toHaveTextContent("11 / 18");
	expect(blocks[2]?.querySelector("dd p")).toHaveTextContent(locale === "ar-SA" ? "11 ردًّا مؤرخًا" : "11 dated replies");
	expect(blocks[2]?.querySelector("dd p")).not.toHaveTextContent("·");
});
it.each([
	["ar-SA", 0, "0 ردود مؤرخة"],
	["ar-SA", 1, "1 رد مؤرخ"],
	["ar-SA", 2, "ردّان مؤرّخان"],
	["ar-SA", 3, "3 ردود مؤرخة"],
	["ar-SA", 100, "100 رد مؤرخ"],
	["en-US", 1, "1 dated reply"],
])("uses the %s plural form for %s dated replies", (locale, count, caption) => {
	i18n.loadAndActivate({ locale, messages: locale === "ar-SA" ? arabicMessages : {} });
	const saved = jobs(Math.max(0, 5 - count), "saved").map((application) => ({
		...application,
		id: `saved-${application.id}`,
	}));
	const { container } = show([...jobs(count), ...saved]);
	expect(container.querySelector("[data-slot=insights-summary] > div:last-child dd p")).toHaveTextContent(caption);
});
it.each([
	["ar-SA", "ردًّا مؤرخًا · 1 دون تواريخ صالحة"],
	["en-US", "dated replies · 1 without usable dates"],
])("keeps nonzero missing-date coverage visible in %s", (locale, caption) => {
	i18n.loadAndActivate({ locale, messages: locale === "ar-SA" ? arabicMessages : {} });
	const applications = jobs(12);
	const first = applications[0];
	if (!first) throw new Error("The application fixture is missing");
	first.appliedAt = new Date("invalid");
	first.activity = first.activity.filter((entry) => entry.type !== "stage" || entry.stage !== "applied");
	const { container } = show(applications);
	expect(container.querySelector("[data-slot=insights-summary] > div:last-child dd p")).toHaveTextContent(
		`11 ${caption}`,
	);
});
it.each([0, 4])("shows a friendly hint for %s tracked jobs", (count) => {
	const { container } = show(jobs(count));
	expect(screen.getByText("Track at least 5 jobs to explore your application insights.")).toBeVisible();
	expect(container.querySelector('[data-slot="insight-week"]')).toBeNull();
});
it("does not invent a rate for saved-only jobs", () => {
	const { container } = show(jobs(5, "saved"));
	expect(screen.getByText("No applications sent yet")).toBeVisible();
	expect(screen.getByText("No applications were sent in these 8 weeks.")).toBeVisible();
	expect(screen.getByText("No applications reached Interview yet.")).toBeVisible();
	expect(container.textContent).not.toMatch(/NaN|Infinity/);
});
it("keeps other charts while documents are pending", () => {
	documents.data = undefined;
	documents.isPending = true;
	show(jobs(5));
	expect(screen.getByText("Loading resume comparison…")).toBeVisible();
	expect(screen.getByRole("heading", { name: "How far applications get" })).toBeVisible();
	expect(screen.queryByText("Another linked resume")).toBeNull();
});
it.each([false, true])("recovers from failed document queries with cached data %s", async (cached) => {
	documents.data = cached ? [] : undefined;
	documents.isError = true;
	show(jobs(5));
	expect(screen.getByText("Could not refresh resume details")).toBeVisible();
	expect(screen.getByRole("heading", { name: "How far applications get" })).toBeVisible();
	expect(screen.queryByText("Another linked resume") !== null).toBe(cached);
	await userEvent.click(screen.getByRole("button", { name: "Retry" }));
	expect(documents.refetch).toHaveBeenCalled();
});
it("exposes all five data tables through one disclosure", async () => {
	show(jobs(7));
	const disclosure = screen.getByRole("button", { name: "Calculations and data tables" });
	expect(disclosure).toHaveAttribute("aria-expanded", "false");
	await userEvent.click(disclosure);
	expect(disclosure).toHaveAttribute("aria-expanded", "true");
	expect(screen.getAllByRole("table")).toHaveLength(5);
	await userEvent.click(screen.getByRole("button", { name: "Other sources", expanded: false }));
	expect(screen.getAllByText("Source 6").length).toBeGreaterThan(1);
	expect(
		[...document.querySelectorAll<HTMLElement>('[data-slot="insight-bar-fill"]')].every(
			(bar) => Number.parseFloat(bar.style.width) <= 100,
		),
	).toBe(true);
});
it("uses equal scales only when both comparison groups have five sends", () => {
	const applications = jobs(10);
	for (let index = 0; index < 5; index++) {
		const application = applications[index];
		if (application) application.resumeId = `tailored-${index}`;
	}
	documents.data = applications
		.slice(0, 5)
		.map((application) => ({ id: application.resumeId, type: "resume", application: { id: application.id } }));
	show(applications);
	const card = document.querySelector('[aria-labelledby="insights-comparison"]');
	if (!card) throw new Error("The comparison card is missing");
	expect(card?.querySelectorAll('[data-slot="insight-bar-fill"]')).toHaveLength(2);
	expect(
		[...card.querySelectorAll<HTMLElement>('[data-slot="insight-bar-fill"]')].map((bar) => bar.style.width),
	).toEqual(["100%", "100%"]);
});
it("keeps low-sample counts and hides unsupported rates", () => {
	const applications = [...jobs(4), ...jobs(1, "saved").map((application) => ({ ...application, id: "saved-only" }))];
	show(applications);
	expect(document.querySelectorAll("[data-slot=insights-summary] dd")[1]).toHaveTextContent("—");
	expect(
		screen.getAllByText("Fewer than 5 records. More data is needed to show a reliable rate.").length,
	).toBeGreaterThan(1);
	expect(document.querySelector('[aria-labelledby="insights-comparison"] [data-slot="insight-bar-fill"]')).toBeNull();
});
it("blocks repeated export and restores retry after failure", async () => {
	let fail!: (reason: Error) => void;
	exportPng.mockImplementationOnce(
		() =>
			new Promise<void>((_resolve, reject) => {
				fail = reject;
			}),
	);
	show(jobs(5));
	const button = screen.getByRole("button", { name: "Export PNG" });
	await userEvent.click(button);
	expect(button).toHaveAttribute("aria-busy", "true");
	await userEvent.click(button);
	expect(exportPng).toHaveBeenCalledOnce();
	fail(new Error("image failed"));
	expect(await screen.findByRole("alert")).toHaveTextContent("Could not export the funnel. Try again.");
	expect(button).not.toHaveAttribute("aria-busy", "true");
});
