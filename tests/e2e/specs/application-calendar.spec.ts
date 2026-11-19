import type { Page } from "@playwright/test";
import { failRpcRead } from "../fixtures/rpc-failure";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";
import { variantClient } from "../fixtures/variants";

// The API helper permits disposable accounts only. Never reset or alter the running demo.
test.use({ timezoneId: "UTC", hasTouch: true });
const destination = "/dashboard/applications?view=calendar";
const instant = "2026-11-18T00:00:00Z";
async function scheduleFixture(page: Page) {
	await page.clock.install({ time: new Date(instant) });
	await page.goto(destination + "&locale=en-US");
	const api = variantClient(page);
	await api.auth.updateProfile({ timezone: "Asia/Riyadh" });
	const applications = [];
	for (let index = 0; index < 20; index++)
		applications.push(
			await api.applications.create({
				company:
					index === 0
						? "International Desert Observatory Research and Engineering Company"
						: index === 1
							? "الشركة العربية للأبحاث والتطوير والأنظمة المتقدمة"
							: `Calendar Company ${index}`,
				role: index === 0 ? "مهندس منصات وبرمجيات" : "Senior Platform Engineer",
				status: "interview",
				notes: "Saved notes remain independent.",
			}),
		);
	const timestamps = [
		"11-18T10:00",
		"11-18T14:00",
		"11-19T10:00",
		"11-20T10:00",
		"11-21T10:00",
		"11-22T10:00",
		"11-23T10:00",
		"11-24T10:00",
		"11-25T10:00",
		"11-30T21:30",
		"12-01T08:00",
		"12-01T10:00",
		"12-01T12:00",
		"12-02T10:00",
		"12-03T10:00",
	];
	const noteApplication = applications[0];
	if (!noteApplication) throw new Error("Missing note fixture application");
	await api.applications.addNote({ id: noteApplication, text: "A note does not add an interview." });
	const kinds = ["screening", "technical", "behavioral", "onsite", "other"] as const;
	for (const [index, timestamp] of timestamps.entries()) {
		const id = applications[index];
		if (!id) throw new Error("Missing calendar fixture application");
		await api.applications.addInterview({
			id,
			at: `2026-${timestamp}:00Z`,
			kind: kinds[index % kinds.length] ?? "other",
			durationMinutes: 60,
			location: index === 0 ? "https://example.test/meeting" : "Fictional office",
			notes: "Preparation notes",
			participants: [],
			audience: "hiring-manager",
			timezone: "Asia/Riyadh",
		});
	}
	await page.goto(destination + "&locale=en-US");
	await settleScreen(page);
	return { api, applications, records: await api.applications.list({}) };
}
const agenda = (page: Page) => page.locator(".calendar-agenda");
const rows = (page: Page) => agenda(page).locator("[data-upcoming-interview]");

test("calendar scopes, five-row expansion and account-zone boundary retain saved records", async ({
	authPage: page,
}) => {
	const { api, records } = await scheduleFixture(page);
	expect(records).toHaveLength(20);
	expect(records.flatMap((record) => record.activity).some((entry) => entry.type === "note")).toBe(true);
	expect(records.flatMap((record) => record.activity).filter((entry) => entry.type === "interview")).toHaveLength(15);
	await expect(page.getByText("9 interviews this month", { exact: true })).toBeVisible();
	await expect(page.getByText("15 in the grid", { exact: true })).toBeVisible();
	await expect(page.getByText("15 upcoming", { exact: true })).toBeVisible();
	await expect(rows(page)).toHaveCount(5);
	await agenda(page).getByRole("button", { name: "Show all (15)" }).click();
	await expect(rows(page)).toHaveCount(15);
	await agenda(page).getByRole("button", { name: "Show next 5" }).click();
	await expect(rows(page)).toHaveCount(5);
	const boundary = page.locator('[role="gridcell"][data-day="2026-12-01"]');
	await expect(boundary.locator('[data-calendar-event="chip"]')).toHaveCount(3);
	await expect(boundary).toHaveAttribute("data-outside", "true");
	await boundary.getByRole("button", { name: "+1 more", exact: true }).click();
	await expect(page.getByRole("dialog").locator('[data-calendar-event="detail"]')).toHaveCount(4);
	await page.keyboard.press("Escape");
	await expect(boundary).toBeFocused();
	await page.getByRole("button", { name: "Next month", exact: true }).click();
	await expect(page.getByText("6 interviews this month", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "This month", exact: true }).click();
	await expect(page.getByText("9 interviews this month", { exact: true })).toBeVisible();
	for (const locale of ["ar-SA", "en-US"]) {
		await page.goto(destination + `&locale=${locale}`);
		await settleScreen(page);
		await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar-SA" ? "rtl" : "ltr");
		expect(await api.applications.list({})).toEqual(records);
		const fields = rows(page).first().locator('bdi[dir="auto"]');
		expect(await fields.nth(0).evaluate((element) => getComputedStyle(element).direction)).toBe("ltr");
		expect(await fields.nth(1).evaluate((element) => getComputedStyle(element).direction)).toBe("rtl");
	}
});

test("keyboard dates, full event identity and safe interview access", async ({ authPage: page }) => {
	const { api, records } = await scheduleFixture(page);
	const grid = page.getByRole("grid");
	await expect(grid.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);
	await expect(grid.locator('button:not([tabindex="-1"])')).toHaveCount(0);
	const today = grid.locator('[aria-current="date"]');
	await today.focus();
	for (const [key, day] of [
		["ArrowDown", "2026-11-25"],
		["ArrowUp", "2026-11-18"],
		["ArrowRight", "2026-11-19"],
		["ArrowLeft", "2026-11-18"],
		["Home", "2026-11-15"],
		["End", "2026-11-21"],
		["PageDown", "2026-12-21"],
		["PageUp", "2026-11-21"],
	]) {
		await page.keyboard.press(key ?? "");
		await expect(page.locator(`[role="gridcell"][data-day="${day}"]`)).toBeFocused();
	}
	await page.keyboard.press("Enter");
	await expect(page.getByRole("dialog")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(grid.locator('[data-day="2026-11-21"]')).toBeFocused();
	const chip = grid.locator('[data-calendar-event="chip"]').first();
	await chip.hover();
	await expect(page.getByRole("tooltip")).toContainText("International Desert Observatory");
	const event = rows(page).first();
	await event.focus();
	const tooltip = page.getByRole("tooltip").and(page.locator("[data-open]"));
	await expect(tooltip).toContainText("International Desert Observatory");
	await expect(tooltip).toContainText("https://example.test/meeting");
	await expect(tooltip).toContainText("Asia/Riyadh");
	await expect(event.locator('bdi[dir="auto"]')).toHaveCount(2);
	await expect(event.locator('[data-slot="icon"]')).toBeVisible();
	await event.click();
	const dialog = page.getByRole("dialog", { name: "Edit interview" });
	await expect(dialog).toContainText("Preparation notes");
	await expect(dialog.getByRole("link", { name: "Join", exact: true })).toHaveAttribute(
		"href",
		"https://example.test/meeting",
	);
	await expect(dialog.getByRole("link", { name: "Join", exact: true })).toHaveAttribute("rel", "noopener noreferrer");
	await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
	await expect(event).toBeFocused();
	expect(await api.applications.list({})).toEqual(records);
	await rows(page).nth(1).click();
	await expect(page.getByRole("dialog").getByRole("link", { name: "Join", exact: true })).toHaveCount(0);
	await page.getByRole("dialog").getByRole("button", { name: "View application", exact: true }).click();
	await expect(page).toHaveURL(
		new RegExp(`/dashboard/applications/${records.find((record) => record.company.startsWith("الشركة"))?.id}`),
	);
});

test("phone week, closed month and expansion retain the five-row agenda", async ({ authPage: page }, info) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await scheduleFixture(page);
	await expect(page.locator("[data-calendar-week]")).toBeVisible();
	await expect(page.getByTestId("interview-calendar")).toHaveCount(0);
	await expect(rows(page)).toHaveCount(5);
	await expect(agenda(page).getByRole("button", { name: "Schedule interview", exact: true })).toBeVisible();
	await info.attach("calendar-phone-layout", {
		body: JSON.stringify(
			await page.locator(".application-calendar").evaluate((element) =>
				Array.from(
					element.querySelectorAll(
						".calendar-agenda, .calendar-agenda-body, .calendar-agenda-footer, .calendar-month-disclosure",
					),
				).map((node) => ({
					name: node.className,
					box: node.getBoundingClientRect().toJSON(),
					height: getComputedStyle(node).height,
					gridRow: getComputedStyle(node).gridRow,
				})),
			),
		),
		contentType: "application/json",
	});
	await agenda(page).getByRole("button", { name: "Show all (15)" }).click();
	await page.getByRole("button", { name: /Show month/ }).click();
	await expect(page.getByTestId("interview-calendar")).toBeVisible();
	await expect(rows(page)).toHaveCount(15);
	await expect(page.locator('[data-day="2026-12-01"] [data-calendar-event="chip"]')).toHaveCount(0);
	await page.locator('[role="gridcell"][data-day="2026-12-01"]').tap();
	await expect(page.getByRole("dialog").locator('[data-calendar-event="detail"]')).toHaveCount(4);
	await page.keyboard.press("Escape");
	await page.getByRole("button", { name: /Hide month/ }).click();
	await expect(rows(page)).toHaveCount(15);
	await agenda(page).getByRole("button", { name: "Show next 5" }).click();
	await expect(rows(page)).toHaveCount(5);
	const bounds = await page.evaluate(() => ({
		width: document.documentElement.clientWidth,
		scroll: document.documentElement.scrollWidth,
	}));
	expect(bounds.scroll).toBeLessThanOrEqual(bounds.width);
});

test("search, closed filter and failed refresh preserve recoverable state", async ({ authPage: page }) => {
	await scheduleFixture(page);
	const search = page.getByRole("searchbox", { name: "Search applications" });
	await search.fill("no matching company");
	await expect(page.getByRole("button", { name: "Clear search", exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Clear search", exact: true }).click();
	await expect(rows(page)).toHaveCount(5);
	await page.getByRole("switch", { name: "Show closed" }).check();
	await page.clock.resume();
	await expect
		.poll(() =>
			page.evaluate(() => {
				const client = (
					window as unknown as { __TSR_ROUTER__: { options: { context: { queryClient: { isFetching(): number } } } } }
				).__TSR_ROUTER__.options.context.queryClient;
				return client.isFetching();
			}),
		)
		.toBe(0);
	let restoreRead = await failRpcRead(page, "applications/list");
	await search.fill("Calendar Company");
	await page.evaluate(async () => {
		const client = (
			window as unknown as {
				__TSR_ROUTER__: {
					options: {
						context: {
							queryClient: {
								getQueryCache(): {
									findAll(): {
										queryKey: unknown[];
										isActive(): boolean;
										options: Record<string, unknown>;
										setOptions(options: Record<string, unknown>): void;
									}[];
								};
								invalidateQueries(options: { queryKey: unknown[] }): Promise<unknown>;
							};
						};
					};
				};
			}
		).__TSR_ROUTER__.options.context.queryClient;
		const queries = client
			.getQueryCache()
			.findAll()
			.filter(
				(item) =>
					item.isActive() && Array.isArray(item.queryKey[0]) && item.queryKey[0].join("/") === "applications/list",
			);
		if (!queries.length) throw new Error("Applications query missing");
		for (const query of queries) query.setOptions({ ...query.options, retry: false });
		await Promise.all(queries.map((query) => client.invalidateQueries({ queryKey: query.queryKey })));
	});
	await expect(page.getByRole("alert")).toContainText("Couldn't load applications");
	await expect(rows(page)).toHaveCount(5);
	await expect(search).toHaveValue("Calendar Company");
	await restoreRead();
	await page.getByRole("button", { name: "Retry", exact: true }).click();
	await expect(page.getByRole("alert")).toHaveCount(0);
	await expect(search).toHaveValue("Calendar Company");
	restoreRead = await failRpcRead(page, "applications/list");
	// A new document proves initial failure without retaining the cached list.

	await page.reload();
	await expect(page.getByRole("alert")).toContainText("Couldn't load applications");
	await expect(page.getByText("Nothing scheduled yet", { exact: true })).toHaveCount(0);
	await restoreRead();
	await page.getByRole("button", { name: "Retry", exact: true }).click();
	await expect(rows(page)).toHaveCount(5);
	await expect(page.getByRole("switch", { name: "Show closed" })).toBeChecked();
});

test("editing an interview waits for acknowledgement and persists after reopening", async ({ authPage: page }) => {
	const { api } = await scheduleFixture(page);
	await rows(page).first().click();
	const dialog = page.getByRole("dialog", { name: "Edit interview" });
	await dialog.getByLabel("What they asked you to prepare").fill("Updated fictional preparation notes");
	let release: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/api/rpc/applications/updateInterview*", async (route) => {
		await gate;
		await route.continue();
	});
	await dialog.getByRole("button", { name: "Save interview", exact: true }).click();
	await expect(dialog).toBeVisible();
	expect(
		(await api.applications.list({}))
			.flatMap((record) => record.activity)
			.filter((entry) => entry.type === "interview")
			.every((entry) => entry.notes !== "Updated fictional preparation notes"),
	).toBe(true);
	release();
	await expect(dialog).toHaveCount(0);
	await page.reload();
	await settleScreen(page);
	await rows(page).first().click();
	await expect(page.getByRole("dialog").getByLabel("What they asked you to prepare")).toHaveValue(
		"Updated fictional preparation notes",
	);
});

test("pending reads retain calendar regions before showing real interviews", async ({ authPage: page }) => {
	await scheduleFixture(page);
	let release: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/api/rpc/**", async (route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname;
		const batch = path.endsWith("/__batch__") ? (request.postDataJSON() as Array<{ url: string }>) : [];
		if (
			path === "/api/rpc/applications/list" ||
			batch.some((item) => new URL(item.url).pathname === "/api/rpc/applications/list")
		)
			await gate;
		await route.fallback();
	});
	// Clear only the collection cache after the shell finishes. Hold its real read without blocking shell reads in a batch.
	await page.evaluate(() => {
		const router = (
			window as unknown as {
				__TSR_ROUTER__: {
					options: {
						context: {
							queryClient: {
								resetQueries: (filters: {
									predicate: (query: { queryKey: readonly unknown[] }) => boolean;
								}) => Promise<unknown>;
							};
						};
					};
				};
			}
		).__TSR_ROUTER__;
		void router.options.context.queryClient.resetQueries({
			predicate: (query) => Array.isArray(query.queryKey[0]) && query.queryKey[0].join("/") === "applications/list",
		});
	});
	await expect(page.locator('.application-calendar[aria-hidden="true"]')).toBeVisible();
	await expect(page.getByText("Nothing scheduled yet", { exact: true })).toHaveCount(0);
	release();
	await expect(rows(page)).toHaveCount(5);
	await expect(page.locator('.application-calendar[aria-hidden="true"]')).toHaveCount(0);
});

test("type treatments retain contrast and desktop panels retain equal heights", async ({ authPage: page }) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.emulateMedia({ reducedMotion: "reduce" });
	await scheduleFixture(page);
	for (const dark of [false, true]) {
		await page.evaluate((value) => document.documentElement.classList.toggle("dark", value), dark);
		const contrasts = await page.locator('[data-calendar-event="chip"]').evaluateAll((elements) =>
			elements.map((element) => {
				const style = getComputedStyle(element);
				const linear = (value: number) => {
					const channel = value / 255;
					return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
				};
				const luminance = (color: string) => {
					const values = color
						.match(/[\d.]+/g)
						?.slice(0, 3)
						.map(Number);
					if (!values || values.length !== 3) throw new Error("Expected an RGB calendar color");
					return linear(values[0] ?? 0) * 0.2126 + linear(values[1] ?? 0) * 0.7152 + linear(values[2] ?? 0) * 0.0722;
				};
				const ink = luminance(style.color);
				const surface = luminance(style.backgroundColor);
				return (Math.max(ink, surface) + 0.05) / (Math.min(ink, surface) + 0.05);
			}),
		);
		for (const contrast of contrasts) expect(contrast).toBeGreaterThanOrEqual(4.5);
	}
	const month = await page.locator(".calendar-month-panel").boundingBox();
	const next = await agenda(page).boundingBox();
	if (!month || !next) throw new Error("Calendar panels must be visible");
	expect(Math.abs(month.height - next.height)).toBeLessThan(1);
	expect(Math.abs(month.y - next.y)).toBeLessThan(1);
});
