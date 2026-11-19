// @vitest-environment happy-dom
import type { Application } from "../types";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, assert, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterContextProvider,
} from "@tanstack/react-router";
import { ApplicationCard } from "./application-card";
import { ApplicationGroupToggle, useApplicationGroupCollapse } from "./list-group-collapse";
import { ApplicationList } from "./list-view";
import { getUiLocaleMessages } from "@/libs/locale";

const media = vi.hoisted(() => ({ breakpoint: "desktop" }));
vi.mock("@reactive-resume/ui/hooks/use-breakpoint", () => ({ useBreakpoint: () => media.breakpoint }));
vi.mock("../use-application-actions", () => ({ useInvalidateApplications: () => vi.fn() }));
vi.mock("@/libs/orpc/client", () => ({
	orpc: { documents: { list: { queryOptions: () => ({ queryKey: ["documents"], queryFn: async () => [] }) } } },
}));
vi.mock("@/hooks/use-confirm", () => ({ useConfirm: () => vi.fn() }));

const application: Application = {
	id: "owned-application",
	role: "Engineer",
	company: "Synthetic Company",
	location: "Riyadh",
	status: "saved",
	activity: [],
	tags: ["Remote"],
	contacts: [],
	appliedAt: new Date("2026-11-16T12:00:00Z"),
	updatedAt: new Date("2026-11-16T12:00:00Z"),
	closedReason: null,
	coverLetterId: null,
	selectedResumeVersionId: null,
	sentResumeRecordedAt: null,
	sentResumeVersionId: null,
	sentCoverLetterVersionId: null,
	sentCheckScore: null,
	requirements: [],
	salary: null,
	source: null,
	sourceUrl: null,
	notes: null,
	createdAt: new Date("2026-11-16T12:00:00Z"),
	resumeId: null,
	jobDescription: null,
	postingSource: null,
	matchScore: null,
	aiMetadata: null,
	resumeFileUrl: null,
	resumeFileName: null,
	coverLetterUrl: null,
	coverLetterName: null,
	followUpAt: null,
	followUpNote: null,
};

const longRole = "A very long English job title in an Arabic interface";
const applications: Application[] = [
	{ ...application, id: "interview", status: "interview", resumeId: "resume", coverLetterId: "letter" },
	{ ...application, id: "offer", status: "offer", role: longRole },
];
function ListWithToggle({
	groupBy,
	rows,
	onOpen,
}: {
	groupBy: "stage" | null;
	rows: Application[];
	onOpen: (application: Application) => void;
}) {
	const collapse = useApplicationGroupCollapse();
	return (
		<>
			<ApplicationGroupToggle state={collapse} statuses={rows.map((row) => row.status)} />
			<ApplicationList applications={rows} showClosed onOpen={onOpen} groupBy={groupBy} collapseState={collapse} />
		</>
	);
}
function mount(groupBy: "stage" | null = "stage", rows = applications, onOpen = vi.fn()) {
	const root = createRootRoute();
	const router = createRouter({
		history: createMemoryHistory(),
		routeTree: root.addChildren([
			createRoute({ getParentRoute: () => root, path: "/builder/$resumeId" }),
			createRoute({ getParentRoute: () => root, path: "/builder/letter/$coverLetterId" }),
		]),
	});
	const queryClient = new QueryClient();
	queryClient.setQueryData(
		["documents"],
		[
			{ id: "resume", type: "resume", name: "Engineering CV" },
			{ id: "letter", type: "letter", name: "رسالة Example" },
		],
	);
	return render(
		<QueryClientProvider client={queryClient}>
			<RouterContextProvider router={router}>
				<I18nProvider i18n={i18n}>
					<ListWithToggle rows={rows} onOpen={onOpen} groupBy={groupBy} />
				</I18nProvider>
			</RouterContextProvider>
		</QueryClientProvider>,
	);
}
beforeEach(() => {
	media.breakpoint = "desktop";
	window.localStorage.clear();
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

it("keeps the same column contract when a stage closes", () => {
	mount();
	const columns = () => [...document.querySelectorAll("col")].map((col) => [col.dataset.column, col.className]);
	const before = columns();
	expect(before).toHaveLength(5);
	expect(screen.getByRole("table").className).toContain("table-fixed");
	fireEvent.click(screen.getByRole("button", { name: /Interview/ }));
	expect(columns()).toEqual(before);
	expect(screen.queryByRole("columnheader", { name: "Stage" })).toBeNull();
});
it("shows the stage for an ungrouped list", () => {
	mount(null);
	expect(screen.getByRole("columnheader", { name: "Stage" })).toBeTruthy();
	expect(document.querySelectorAll("col")).toHaveLength(6);
	expect(screen.getByText("Offer").closest("td")?.className).toContain("whitespace-nowrap");
	expect(screen.queryByRole("button", { name: /Interview/ })).toBeNull();
});
it("opens each recorded document version separately without opening the application", () => {
	const onOpen = vi.fn();
	assert(applications[0]);
	mount(
		"stage",
		[{ ...applications[0], sentResumeVersionId: "sent-cv", sentCoverLetterVersionId: "sent-letter" }],
		onOpen,
	);
	const cv = screen.getByRole("link", { name: "Sent CV: Engineering CV" });
	const letter = screen.getByRole("link", { name: "Sent cover letter: رسالة Example" });
	expect(cv.getAttribute("href")).toBe("/builder/resume?version=sent-cv");
	expect(letter.getAttribute("href")).toBe("/builder/letter/letter?version=sent-letter");
	expect(cv.getAttribute("data-slot")).toBe("tooltip-trigger");
	cv.focus();
	expect(document.activeElement).toBe(cv);
	const bubble = vi.fn();
	document.addEventListener("click", bubble);
	document.addEventListener("keydown", bubble);
	fireEvent.keyDown(cv, { key: "Enter" });
	fireEvent.keyDown(letter, { key: "Enter" });
	fireEvent.click(cv);
	fireEvent.click(letter);
	document.removeEventListener("click", bubble);
	document.removeEventListener("keydown", bubble);
	expect(bubble).not.toHaveBeenCalled();
	expect(onOpen).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: /Engineer Synthetic Company/ }));
	expect(onOpen).toHaveBeenCalledOnce();
});
it("opens current linked documents when no sent snapshot exists", () => {
	mount();
	expect(screen.getByRole("link", { name: "Sent CV: Engineering CV" }).getAttribute("href")).toBe("/builder/resume");
	expect(screen.getByRole("link", { name: "Sent cover letter: رسالة Example" }).getAttribute("href")).toBe(
		"/builder/letter/letter",
	);
});
it("keeps headers on one line and titles in their own direction", () => {
	mount();
	expect(screen.getByRole("table").className).toContain("[&_thead_th]:whitespace-nowrap");
	const title = screen.getByText(longRole);
	expect(title.getAttribute("dir")).toBe("auto");
	expect(title.getAttribute("title")).toBe(longRole);
	expect(title.className).toContain("truncate");
});
it("keeps column labels for the summaries when every group closes", () => {
	mount();
	fireEvent.click(screen.getByRole("button", { name: /Interview/ }));
	fireEvent.click(screen.getByRole("button", { name: /Offer/ }));
	expect(screen.getByRole("columnheader", { name: "Next step" })).toBeTruthy();
	expect(screen.getAllByRole("row")).toHaveLength(3);
	expect(screen.getAllByRole("button", { expanded: false })).toHaveLength(3);
});

it("keeps the soonest future step and latest update aligned after collapse", () => {
	const now = new Date();
	const earlier = new Date(now.getTime() + 86_400_000);
	const later = new Date(now.getTime() + 172_800_000);
	mount("stage", [
		{
			...application,
			id: "early",
			status: "interview",
			followUpAt: earlier,
			followUpNote: "راجع موعد Example",
			updatedAt: now,
		},
		{ ...application, id: "later", status: "interview", followUpAt: later, followUpNote: "Later step" },
	]);
	const toggle = screen.getByRole("button", { name: "Interview 2" });
	const row = toggle.closest("tr");
	assert(row);
	const cells = within(row).getAllByRole("cell");
	expect(cells).toHaveLength(3);
	expect(cells[0]?.textContent).toContain("Follow up");
	expect(toggle.getAttribute("title")).toContain("راجع موعد Example");
	expect(cells[0]?.textContent).not.toContain("Later step");
	expect(cells[0]?.querySelector("[dir=auto]")).toBeTruthy();
	expect(cells[2]?.textContent).toBeTruthy();
	fireEvent.click(toggle);
	expect(toggle.getAttribute("aria-expanded")).toBe("false");
	expect(cells[0]?.textContent).toContain("Follow up");
	toggle.focus();
	expect(document.activeElement).toBe(toggle);
	expect(toggle.tagName).toBe("BUTTON");
});

it("leaves the summary step empty without an upcoming dated action and removes company initials", () => {
	mount("stage", [application]);
	const row = screen.getByRole("button", { name: "Saved 1" }).closest("tr");
	assert(row);
	expect(within(row).getAllByRole("cell")[0]?.textContent).toBe("");
	expect(screen.queryByText("S", { exact: true })).toBeNull();
});

it("removes the repeated company initial from board cards", () => {
	render(
		<I18nProvider i18n={i18n}>
			<ApplicationCard application={application} onClick={vi.fn()} />
		</I18nProvider>,
	);
	expect(screen.getByText("Synthetic Company")).toBeTruthy();
	expect(screen.queryByText("S", { exact: true })).toBeNull();
});

it("names the document controls in Arabic with mixed-direction document names", async () => {
	i18n.loadAndActivate(await getUiLocaleMessages("ar-SA"));
	mount();
	expect(screen.getByRole("link", { name: "السيرة المرسلة: Engineering CV" })).toBeTruthy();
	expect(screen.getByRole("link", { name: "الخطاب المرسل: رسالة Example" })).toBeTruthy();
});

it("keeps the mobile list in one column without initials or desktop summaries", () => {
	media.breakpoint = "mobile";
	mount();
	expect(document.querySelectorAll("col")).toHaveLength(1);
	expect(screen.queryByRole("columnheader", { name: "Next step" })).toBeNull();
	expect(screen.getByText(longRole).getAttribute("dir")).toBe("auto");
	expect(screen.queryByText("S", { exact: true })).toBeNull();
});

it("omits the Updated column and its width together in a compact tablet list", () => {
	media.breakpoint = "tablet";
	mount();
	expect(screen.queryByRole("columnheader", { name: /Updated/ })).toBeNull();
	expect(document.querySelectorAll("col")).toHaveLength(4);
	expect(document.querySelector('col[data-column="updated"]')).toBeNull();
	for (const row of document.querySelectorAll("tbody tr")) {
		const width = [...row.querySelectorAll("td, th")].reduce(
			(sum, cell) => sum + (cell as HTMLTableCellElement).colSpan,
			0,
		);
		expect(width).toBe(4);
	}
});

it("collapses every stage, then expands every stage from the toolbar", () => {
	mount();
	const collapse = screen.getByRole("button", { name: "Collapse all" });
	expect(collapse.getAttribute("aria-pressed")).toBe("false");
	expect(collapse.getAttribute("aria-expanded")).toBe("true");
	fireEvent.click(collapse);
	const expand = screen.getByRole("button", { name: "Expand all" });
	expect(expand.getAttribute("aria-pressed")).toBe("true");
	expect(expand.getAttribute("aria-expanded")).toBe("false");
	expect(screen.queryByText(longRole)).toBeNull();
	expect(screen.getByRole("button", { name: "Interview 1" }).getAttribute("aria-expanded")).toBe("false");
	expect(screen.getByRole("button", { name: "Offer 1" }).getAttribute("aria-expanded")).toBe("false");
	fireEvent.click(expand);
	expect(screen.getByText(longRole)).toBeTruthy();
	expect(screen.getByRole("button", { name: "Interview 1" }).getAttribute("aria-expanded")).toBe("true");
});
it("tracks individual toggles and restores their saved state on remount", () => {
	const view = mount();
	fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
	fireEvent.click(screen.getByRole("button", { name: "Offer 1" }));
	expect(screen.getByRole("button", { name: "Collapse all" })).toBeTruthy();
	view.unmount();
	mount();
	expect(screen.getByRole("button", { name: "Interview 1" }).getAttribute("aria-expanded")).toBe("false");
	expect(screen.getByRole("button", { name: "Offer 1" }).getAttribute("aria-expanded")).toBe("true");
	fireEvent.click(screen.getByRole("button", { name: "Offer 1" }));
	expect(screen.getByRole("button", { name: "Expand all" })).toBeTruthy();
});
it("keeps all stages collapsed when a hidden stage becomes visible", () => {
	const view = mount();
	fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
	view.unmount();
	mount("stage", [...applications, { ...application, id: "closed", status: "closed" }]);
	expect(screen.getByRole("button", { name: "Closed 1" }).getAttribute("aria-expanded")).toBe("false");
	expect(screen.getByRole("button", { name: "Expand all" })).toBeTruthy();
});
it("keeps the toggle usable when browser storage is unavailable", () => {
	vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
		throw new Error("blocked");
	});
	vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
		throw new Error("blocked");
	});
	mount();
	fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
	expect(screen.getByRole("button", { name: "Expand all" })).toBeTruthy();
});
it("uses Arabic labels for both toolbar actions", async () => {
	i18n.loadAndActivate(await getUiLocaleMessages("ar-SA"));
	mount();
	fireEvent.click(screen.getByRole("button", { name: "طي الكل" }));
	expect(screen.getByRole("button", { name: "توسيع الكل" })).toBeTruthy();
});

it.each(["{", "{}", '["unknown-stage"]'])("ignores invalid saved group state: %s", (saved) => {
	window.localStorage.setItem("applications-collapsed-groups", saved);
	mount();
	expect(screen.getByRole("button", { name: "Interview 1" }).getAttribute("aria-expanded")).toBe("true");
	fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
	expect(screen.getByRole("button", { name: "Expand all" })).toBeTruthy();
});
