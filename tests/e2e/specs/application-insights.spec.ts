import type { Page } from "@playwright/test";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";
import { variantClient } from "../fixtures/variants";

const destination = "/dashboard/applications?view=insights";
const day = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
async function createApplications(page: Page, count: number, saved = false) {
	const api = variantClient(page);
	for (let index = 0; index < count; index++) {
		await api.applications.create({
			company: `شركة تجريبية ${index}`,
			role: "Engineer مهندس",
			notes: "Saved content remains independent.",
			status: saved ? "saved" : "applied",
			stageEnteredAt: day(10),
			source: index === 0 ? "شركة التوظيف · Company careers website with a complete stored label" : `Source ${index}`,
		});
	}
}

test("persisted applications drive one historical funnel and full-population search", async ({ authPage: page }) => {
	await page.goto(destination);
	await createApplications(page, 7);
	const api = variantClient(page);
	const [first] = await api.applications.list({});
	if (!first) throw new Error("The synthetic application is missing");
	const interview = await api.applications.update({
		id: first.id,
		expectedUpdatedAt: first.updatedAt.toISOString(),
		status: "interview",
		stageEnteredAt: day(8),
	});
	await api.applications.update({
		id: first.id,
		expectedUpdatedAt: interview.updatedAt.toISOString(),
		status: "closed",
		closedReason: "not-selected",
		stageEnteredAt: day(7),
	});
	await page.reload();
	await settleScreen(page);
	await expect(page.getByRole("heading", { name: "How far applications get", exact: true })).toHaveCount(1);
	await expect(page.getByRole("img", { name: "Pipeline flow", exact: true })).toHaveCount(0);
	await expect(page.locator("[data-slot=insights-summary] dd > bdi").first()).toHaveText("7");
	await expect(page.locator('[data-slot="insight-week"]')).toHaveCount(8);
	const weeks = page.locator('[data-slot="insight-week"]').locator("..");
	await expect(weeks.first()).toHaveAttribute("dir", "ltr");
	await page.getByPlaceholder("Search applications").fill("no such employer exists");
	await expect(page.locator("[data-slot=insights-summary] dd > bdi").first()).toHaveText("7");
	await expect(page.getByRole("heading", { name: "How far applications get" })).toBeVisible();
	await page.getByRole("button", { name: "Other sources", exact: true, expanded: false }).click();
	await expect(page.getByRole("button", { name: "Other sources", expanded: true })).toBeVisible();
	await page.getByRole("button", { name: "Calculations and data tables" }).click();
	await expect(page.getByRole("table")).toHaveCount(5);
	const funnel = page.getByRole("table", { name: "How far applications get" });
	await expect(funnel).toContainText("7 / 7");
	await expect(funnel).toContainText("1 / 7");
	await expect(
		page.getByText("شركة التوظيف · Company careers website with a complete stored label", { exact: true }).first(),
	).toBeVisible();
});

test("empty, four tracked and five saved jobs expose honest sample limits", async ({ authPage: page }) => {
	await page.goto(destination);
	await expect(page.getByText("Track at least 5 jobs to explore your application insights.")).toBeVisible();
	await createApplications(page, 4, true);
	await page.reload();
	await expect(page.getByText("Track at least 5 jobs to explore your application insights.")).toBeVisible();
	await createApplications(page, 1, true);
	await page.reload();
	await expect(page.getByText("No applications sent yet").first()).toBeVisible();
	await expect(page.getByText("No applications were sent in these 8 weeks.")).toBeVisible();
	await expect(page.getByText("No applications reached Interview yet.")).toBeVisible();
	await expect(page.getByText("Each resume group needs at least 5 sent applications to show rate bars.")).toBeVisible();
	await expect(page.locator("[data-slot=insights-summary] dd > bdi").nth(1)).toHaveText("—");
});

test("document failure has Retry while successful application charts remain visible", async ({ authPage: page }) => {
	await page.goto(destination);
	await createApplications(page, 5);
	await page.route("**/api/rpc/documents/list**", (route) => route.abort());
	await page.reload();
	await expect(page.getByText("Could not refresh resume details")).toBeVisible({ timeout: 20000 });
	await expect(page.getByRole("heading", { name: "How far applications get" })).toBeVisible();
	await expect(page.getByText("Another linked resume", { exact: true })).toHaveCount(0);
	await page.unroute("**/api/rpc/documents/list**");
	await page.getByRole("button", { name: "Retry", exact: true }).click();
	await expect(page.getByText("Could not refresh resume details")).toHaveCount(0);
	await expect(page.getByText("5 sent without a linked resume")).toBeVisible();
});

test("keyboard access exposes tooltips and tables without hover", async ({ authPage: page }) => {
	await page.goto(destination);
	await createApplications(page, 5);
	await variantClient(page).applications.create({ company: "Unrecorded source", role: "Engineer" });
	await page.reload();
	await settleScreen(page);
	const firstWeek = page.locator('[data-slot="insight-week"]').first();
	await firstWeek.focus();
	await expect(firstWeek).toBeFocused();
	await expect(page.getByRole("tooltip")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByRole("tooltip")).toHaveCount(0);
	const disclosure = page.getByRole("button", { name: "Calculations and data tables" });
	await disclosure.focus();
	await page.keyboard.press("Enter");
	await expect(disclosure).toHaveAttribute("aria-expanded", "true");
	await expect(page.getByRole("table")).toHaveCount(5);
	await page.getByRole("link", { name: "Update sources in the list" }).click();
	await expect(page).toHaveURL(/\/dashboard\/applications$/);
	await expect(page.getByRole("tab", { name: "List", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("interface switching preserves saved application and document content on narrow screens", async ({
	authPage: page,
}) => {
	await page.goto(destination);
	await createApplications(page, 7);
	const api = variantClient(page);
	const before = {
		applications: await api.applications.list({}),
		documents: await api.documents.list({ trashed: false }),
	};
	const created = await page.request.post("/api/openapi/resumes", {
		data: { name: "Synthetic bilingual content check", tags: [], withSampleData: true },
	});
	await expect(created).toBeOK();
	const resumeId = (await created.json()) as string;
	const savedResume = await api.resume.getById({ id: resumeId });
	before.documents = await api.documents.list({ trashed: false });
	await page.setViewportSize({ width: 390, height: 844 });
	for (const locale of ["ar-SA", "en-US"]) {
		await page.goto(`${destination}&locale=${locale}`);
		await settleScreen(page);
		await expect(page.locator('[data-slot="insight-week"]')).toHaveCount(8);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	}
	expect(await api.applications.list({})).toEqual(before.applications);
	expect(await api.documents.list({ trashed: false })).toEqual(before.documents);
	expect((await api.resume.getById({ id: resumeId })).data).toEqual(savedResume.data);
});

test("old sends retain counts without inventing activity in the eight-week window", async ({ authPage: page }) => {
	await page.goto(destination);
	const api = variantClient(page);
	for (let index = 0; index < 5; index++) {
		await api.applications.create({
			company: `Old synthetic ${index}`,
			role: "Engineer",
			status: "applied",
			stageEnteredAt: day(90),
		});
	}
	await page.reload();
	await expect(page.locator("[data-slot=insights-summary] dd > bdi").first()).toHaveText("5");
	await expect(page.getByText("No applications were sent in these 8 weeks.")).toBeVisible();
	await expect(page.locator('[data-slot="insight-week"]')).toHaveCount(8);
});
