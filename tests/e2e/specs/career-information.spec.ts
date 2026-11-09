import { settleScreen } from "../fixtures/screen";
import { test, expect } from "../fixtures/test";

for (const locale of ["en-US", "ar-SA"] as const)
	for (const width of [1440, 390])
		test(`review, edit and conflict recovery ${locale} at ${width}`, async ({ authPage: page, baseURL }, testInfo) => {
			const ar = locale === "ar-SA";
			const labels = {
				add: ar ? "إضافة خبرة" : "Add experience",
				review: ar ? "مراجعة التغييرات" : "Review changes",
				confirm: ar ? "تأكيد التغييرات" : "Confirm changes",
				edit: ar ? "تحرير الإدخال" : "Edit entry",
				latest: ar ? "عرض أحدث نسخة" : "View latest copy",
				cancel: ar ? "إلغاء" : "Cancel",
			};
			await page.setViewportSize({ width, height: 950 });
			await page.context().addCookies([{ name: "locale", value: locale, url: baseURL ?? "http://localhost:3000" }]);
			await page.goto("/dashboard/career/information");
			await expect(page.locator("html")).toHaveAttribute("dir", ar ? "rtl" : "ltr");
			await page.getByRole("button", { name: labels.add, exact: true }).click();
			await page.locator('input[name="company"]').fill("شركة Synthetic ٢٠٢٤");
			await page.locator('input[name="start"]').fill("2025-01");
			await page.locator('input[name="end"]').fill("2024-01");
			await page.getByRole("button", { name: labels.review, exact: true }).click();
			await expect(page.getByRole("alert")).toBeFocused();
			await page.getByRole("alert").getByRole("link").click();
			await expect(page.locator("#career-end")).toBeFocused();
			await page.locator('input[name="end"]').fill("2026-01");
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("career-edit.png"), fullPage: true });
			await page.getByRole("button", { name: labels.review, exact: true }).click();
			await page.getByRole("button", { name: labels.confirm, exact: true }).click();
			await expect(page.getByRole("dialog")).not.toBeVisible();
			const second = await page.context().newPage();
			await second.setViewportSize({ width, height: 950 });
			try {
				await second.goto("/dashboard/career/information");
				await page.getByRole("button", { name: labels.edit, exact: true }).click();
				await second.getByRole("button", { name: labels.edit, exact: true }).click();
				await page.locator('input[name="company"]').fill("Accepted first tab");
				await second.locator('input[name="company"]').fill("مسودة Second tab");
				await page.getByRole("button", { name: labels.review, exact: true }).click();
				await page.getByRole("button", { name: labels.confirm, exact: true }).click();
				await expect(page.getByRole("dialog")).not.toBeVisible();
				await second.getByRole("button", { name: labels.review, exact: true }).click();
				await second.getByRole("button", { name: labels.latest, exact: true }).click();
				await expect(second.locator('input[name="company"]')).toHaveValue("مسودة Second tab");
				await expect(second.getByRole("dialog")).toContainText("Accepted first tab");
				await expect(second.getByRole("dialog")).not.toContainText('"start"');
				await expect(second.getByRole("dialog")).toContainText("2025-01 – 2026-01");
				await settleScreen(second);
				await second.screenshot({ path: testInfo.outputPath("career-conflict.png"), fullPage: true });
				await second.getByRole("button", { name: labels.review, exact: true }).click();
				await second.getByRole("button", { name: labels.confirm, exact: true }).click();
				await expect(second.getByRole("dialog")).not.toBeVisible();
				await second.reload();
				await expect(second.getByRole("heading", { name: "مسودة Second tab", exact: true })).toBeVisible();
				const before = await (await second.request.get("/api/openapi/career/master")).json();
				await second.getByRole("button", { name: labels.edit, exact: true }).click();
				await second.locator('input[name="company"]').fill("Discarded change");
				await second.getByRole("button", { name: labels.cancel, exact: true }).click();
				expect(await (await second.request.get("/api/openapi/career/master")).json()).toEqual(before);
			} finally {
				await second.close();
			}
		});

test("accepted facts show only real owned document links", async ({ authPage: page }) => {
	await page.goto("/dashboard/career/information");
	await page.getByRole("button", { name: "Add skill", exact: true }).click();
	await page.locator('input[name="name"]').fill("Linked synthetic skill");
	await page.getByRole("button", { name: "Review changes", exact: true }).click();
	await page.getByRole("button", { name: "Confirm changes", exact: true }).click();
	await expect(page.getByRole("dialog")).not.toBeVisible();
	const master = await (await page.request.get("/api/openapi/career/master")).json();
	const fact = master.facts[0];
	const created = await page.request.post("/api/openapi/resumes", {
		data: { name: "Linked synthetic CV", tags: [], withSampleData: false },
	});
	expect(created.ok()).toBe(true);
	const resumeId = await created.json();
	expect(
		(
			await page.request.post("/api/openapi/career/master/links", {
				data: { resumeId, links: [{ factId: fact.id, acceptedRevision: fact.revision }] },
			})
		).ok(),
	).toBe(true);
	await page.reload();
	await expect(page.getByRole("link", { name: "Linked synthetic CV", exact: true })).toHaveAttribute(
		"href",
		`/builder/${resumeId}`,
	);
});

test("review locks pending fields and preserves the submitted draft", async ({ authPage: page }) => {
	await page.goto("/dashboard/career/information");
	await page.getByRole("button", { name: "Add experience", exact: true }).click();
	await page.locator('input[name="company"]').fill("Delayed company");
	await page.locator('input[name="position"]').fill("Delayed role");
	let release = () => {};
	let reached = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	const started = new Promise<void>((resolve) => {
		reached = resolve;
	});
	await page.route("**/api/rpc/career/master/savePending", async (route) => {
		reached();
		await held;
		await route.continue();
	});
	await page.getByRole("button", { name: "Review changes", exact: true }).click();
	await started;
	try {
		await expect(page.locator('input[name="company"]')).toBeDisabled();
		await expect(page.locator('input[name="position"]')).toBeDisabled();
		await expect(page.locator('input[name="start"]')).toBeDisabled();
	} finally {
		release();
	}
	await expect(page.getByRole("heading", { name: "Review your changes" })).toBeVisible();
	await page.getByRole("button", { name: "Confirm changes", exact: true }).click();
	await expect(page.getByRole("heading", { name: "Delayed role", exact: true })).toBeVisible();
	await expect(page.getByRole("article").getByText("Delayed company", { exact: true })).toBeVisible();
});
test("Arabic digit dates normalize through the actual form", async ({ authPage: page }) => {
	await page.goto("/dashboard/career/information");
	await page.getByRole("button", { name: "Add experience", exact: true }).click();
	await page.locator('input[name="company"]').fill("مِثال ٢٠٢٤");
	await page.locator('input[name="start"]').fill("٢٠٢٤-٠٣");
	await expect(page.locator('input[name="start"]')).toHaveValue("2024-03");
	await page.locator('input[name="end"]').fill("۲۰۲۵-۰۴");
	await expect(page.locator('input[name="end"]')).toHaveValue("2025-04");
	await page.getByRole("button", { name: "Review changes", exact: true }).click();
	await page.getByRole("button", { name: "Confirm changes", exact: true }).click();
	await expect(page.getByRole("dialog")).not.toBeVisible();
	const master = await (await page.request.get("/api/openapi/career/master")).json();
	expect(
		master.facts.find((f: { structured: { field: string } }) => f.structured?.field === "dates").structured.value,
	).toEqual({ start: "2024-03", end: "2025-04", present: false });
	await expect(page.getByRole("heading", { name: "مِثال ٢٠٢٤", exact: true })).toBeVisible();
});

test("five groups review facts explicitly, survive reload and keep language changes separate", async ({
	authPage: page,
}, testInfo) => {
	await page.goto("/dashboard/career/information");
	await expect(page.getByRole("heading", { name: "Career information" })).toBeVisible();
	for (const [button, field, value] of [
		["Add experience", "company", "شركة مِثال"],
		["Add qualification", "school", "جامعة مثال"],
		["Add skill", "name", "TypeScript"],
		["Add language", "language", "العربية"],
		["Add certificate", "title", "Synthetic qualification"],
	] as const) {
		await page.getByRole("button", { name: button, exact: true }).click();
		await page.getByRole("dialog").locator(`input[name="${field}"]`).fill(value);
		await page.getByRole("button", { name: "Review changes", exact: true }).click();
		await expect(page.getByRole("heading", { name: "Review your changes" })).toBeVisible();
		const before = await page.request.get("/api/openapi/career/master");
		expect(
			(await before.json()).facts.some(
				(fact: { structured: unknown; proposedStructured: { value: unknown } | null }) =>
					fact.proposedStructured?.value === value && fact.structured === null,
			),
		).toBe(true);
		await page.getByRole("button", { name: "Confirm changes", exact: true }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();
		if (field === "name")
			await expect(
				page.getByRole("button", { name: "Edit entry", exact: true }).filter({ hasText: value }),
			).toBeVisible();
		else await expect(page.getByRole("heading", { name: value, exact: true })).toBeVisible();
	}
	await page.reload();
	await expect(page.getByRole("heading", { name: "شركة مِثال", exact: true })).toBeVisible();
	await settleScreen(page);
	await page.screenshot({ path: testInfo.outputPath("information-en-desktop.png"), fullPage: true });
	await page.getByRole("button", { name: "Edit entry" }).first().click();
	await page.locator('input[name="company"]').fill("سارة مثال");
	await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
	await page.getByRole("button", { name: "Switch interface to Arabic" }).click();
	await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
	await page.getByRole("button", { name: "تحرير الإدخال", exact: true }).first().click();
	await expect(page.locator('input[name="company"]')).toHaveValue("سارة مثال");
	await page.getByRole("dialog").getByRole("button", { name: "إلغاء", exact: true }).click();
	for (const width of [1440, 390, 320, 768]) {
		await page.setViewportSize({ width, height: 950 });
		await settleScreen(page);
		await expect
			.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), {
				message: `Reflow at ${width}px`,
			})
			.toBe(true);
		await page.screenshot({ path: testInfo.outputPath(`information-ar-${width}.png`), fullPage: true });
	}
});

test("two tabs retain the losing draft and require review of the latest information", async ({ authPage: page }) => {
	await page.goto("/dashboard/career/information");
	await page.getByRole("button", { name: "Add experience", exact: true }).click();
	await page.locator('input[name="company"]').fill("First company");
	await page.getByRole("button", { name: "Review changes", exact: true }).click();
	await page.getByRole("button", { name: "Confirm changes", exact: true }).click();
	await expect(page.getByRole("dialog")).not.toBeVisible();
	const second = await page.context().newPage();
	await second.goto("/dashboard/career/information");
	await page.getByRole("button", { name: "Edit entry" }).click();
	await second.getByRole("button", { name: "Edit entry" }).click();
	await page.locator('input[name="company"]').fill("First tab change");
	await second.locator('input[name="company"]').fill("Second tab draft");
	await page.getByRole("button", { name: "Review changes", exact: true }).click();
	await page.getByRole("button", { name: "Confirm changes", exact: true }).click();
	await expect(page.getByRole("dialog")).not.toBeVisible();
	await second.getByRole("button", { name: "Review changes", exact: true }).click();
	await expect(second.getByRole("button", { name: "View latest copy" })).toBeVisible();
	await expect(second.locator('input[name="company"]')).toHaveValue("Second tab draft");
	await second.getByRole("button", { name: "View latest copy" }).click();
	await expect(second.getByRole("heading", { name: "Latest saved information" })).toBeVisible();
	await expect(second.locator('input[name="company"]')).toHaveValue("Second tab draft");
	await expect(second.getByRole("dialog")).toContainText("First tab change");
	await second.getByRole("button", { name: "Review changes", exact: true }).click();
	await second.getByRole("button", { name: "Confirm changes", exact: true }).click();
	await expect(second.getByRole("dialog")).not.toBeVisible();
	await page.reload();
	await expect(page.getByRole("heading", { name: "Second tab draft", exact: true })).toBeVisible();
	await second.close();
});

for (const locale of ["en-US", "ar-SA"] as const)
	for (const width of [1440, 390])
		test(`session expiry preserves an owned career draft ${locale} at ${width}`, async ({
			authPage: page,
			account,
			baseURL,
		}, testInfo) => {
			await page.setViewportSize({ width, height: 950 });
			await page.context().addCookies([{ name: "locale", value: locale, url: baseURL ?? "http://localhost:3000" }]);
			await page.goto("/dashboard/career/information");
			await page.getByRole("button", { name: locale === "en-US" ? "Add skill" : "إضافة مهارة", exact: true }).click();
			await page.locator('input[name="name"]').fill("Owned draft العربية");
			const signedOut = await page.request.post("/api/auth/sign-out", {
				headers: { origin: baseURL ?? "http://localhost:3000" },
				data: {},
			});
			expect(signedOut.status(), await signedOut.text()).toBe(200);
			expect(await (await page.request.get("/api/auth/get-session")).json()).toBeNull();
			await page
				.getByRole("button", { name: locale === "en-US" ? "Review changes" : "مراجعة التغييرات", exact: true })
				.click();
			await expect(page).toHaveURL(/auth\/login.*reason=sessionExpired/);
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("session-expired.png"), fullPage: true });
			await page.locator('input[name="identifier"]').fill(account.email);
			await page.locator('input[name="password"]').fill(account.password);
			await page.locator('button[type="submit"]').click();
			await expect(page).toHaveURL(/dashboard\/career\/information/);
			await expect(page.locator('input[name="name"]')).toHaveValue("Owned draft العربية");
		});
