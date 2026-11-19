import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { settleScreen } from "../fixtures/screen";
import { test, expect } from "../fixtures/test";

for (const locale of ["en-US", "ar-SA"] as const)
	for (const width of [1440, 390])
		test(`review, edit and conflict recovery ${locale} at ${width}`, async ({ authPage: page, baseURL }, testInfo) => {
			if (!baseURL) throw new Error("MISSING_BROWSER_BASE_URL");
			const ar = locale === "ar-SA";
			const labels = {
				add: ar ? "إضافة خبرة" : "Add experience",
				review: ar ? "مراجعة التغييرات" : "Review changes",
				confirm: ar ? "تأكيد التغييرات" : "Confirm changes",
				edit: ar ? /^تعديل / : /^Edit /,
				latest: ar ? "عرض أحدث نسخة" : "View latest copy",
				cancel: ar ? "إلغاء" : "Cancel",
			};
			await page.setViewportSize({ width, height: 950 });
			await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
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
				await page
					.getByRole("button", { name: labels.edit, exact: true })
					.and(page.locator("[data-career-edit]"))
					.click();
				await second
					.getByRole("button", { name: labels.edit, exact: true })
					.and(second.locator("[data-career-edit]"))
					.click();
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
				await second
					.getByRole("button", { name: labels.edit, exact: true })
					.and(second.locator("[data-career-edit]"))
					.click();
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
	await page.getByRole("button", { name: "In 1 CV", exact: true }).click();
	await expect(page.getByRole("link", { name: "Open CV Linked synthetic CV", exact: true })).toHaveAttribute(
		"href",
		`/builder/${resumeId}`,
	);
});

test("review locks pending fields and preserves the submitted draft", async ({ authPage: page }, testInfo) => {
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
		await page.screenshot({ path: testInfo.outputPath("career-info-en-US-1440-save-pending.png") });
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
		if (field === "language") await page.keyboard.press("Escape");
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
		await expect(page.getByRole("heading", { name: value, exact: true })).toBeVisible();
	}
	await page.reload();
	await expect(page.getByRole("heading", { name: "شركة مِثال", exact: true })).toBeVisible();
	await settleScreen(page);
	await page.screenshot({ path: testInfo.outputPath("information-en-desktop.png"), fullPage: true });
	await page
		.getByRole("button", { name: /^Edit / })
		.and(page.locator("[data-career-edit]"))
		.first()
		.click();
	await page.locator('input[name="company"]').fill("سارة مثال");
	await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
	await page.getByRole("button", { name: "Switch interface to Arabic" }).click();
	await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
	await page
		.getByRole("button", { name: /^تعديل / })
		.and(page.locator("[data-career-edit]"))
		.first()
		.click();
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
	await page
		.getByRole("button", { name: /^Edit / })
		.and(page.locator("[data-career-edit]"))
		.click();
	await second
		.getByRole("button", { name: /^Edit / })
		.and(second.locator("[data-career-edit]"))
		.click();
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
			await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
			await page.goto("/dashboard/career/information");
			await page.getByRole("button", { name: locale === "en-US" ? "Add skill" : "إضافة مهارة", exact: true }).click();
			await page.locator('input[name="name"]').fill("Owned draft العربية");
			const signedOut = await page.request.post("/api/auth/sign-out", {
				headers: { origin: baseURL },
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

for (const locale of ["ar-SA", "en-US"] as const)
	for (const width of [1440, 390])
		test(`${locale} ${width} CV count reveals full names and exact targets`, async ({ authPage: page }, info) => {
			test.setTimeout(60_000);
			await page.setViewportSize({ width, height: 900 });
			if (width === 390) {
				const session = await page.context().newCDPSession(page);
				await session.send("Emulation.setTouchEmulationEnabled", { enabled: true });
			}
			await page.goto("/dashboard/career/information?locale=en-US");
			await page.getByRole("button", { name: "Add skill", exact: true }).click();
			await page.locator('input[name="name"]').fill("Linked synthetic skill");
			await page.getByRole("button", { name: "Review changes", exact: true }).click();
			await page.getByRole("button", { name: "Confirm changes", exact: true }).click();
			await expect(page.getByRole("dialog")).not.toBeVisible();
			const master = await (await page.request.get("/api/openapi/career/master")).json();
			const fact = master.facts[0];
			const names = [
				"A long synthetic CV name that must truncate without losing the full document title",
				"سيرة عربية",
				"Mixed CV سيرة",
				"Fourth CV",
				"Fifth CV",
			];
			const ids: string[] = [];
			const created = await page.request.post("/api/openapi/resumes", {
				data: { name: names[0], tags: [], withSampleData: false },
			});
			await expect(created).toBeOK();
			ids.push(await created.json());
			const pool = new Pool({ connectionString: process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL });
			try {
				// Seed an existing variant inventory; creating more bases would correctly hit Start's allowance.
				for (const name of names.slice(1)) {
					const id = randomUUID();
					await pool.query(
						"INSERT INTO resume (id,name,slug,user_id,data,base_resume_id,variant_kind) SELECT $1,$2,$1,user_id,data,id,'job' FROM resume WHERE id=$3",
						[id, name, ids[0]],
					);
					ids.push(id);
				}
			} finally {
				await pool.end();
			}
			for (const resumeId of ids) {
				await expect(
					await page.request.post("/api/openapi/career/master/links", {
						data: { resumeId, links: [{ factId: fact.id, acceptedRevision: fact.revision }] },
					}),
				).toBeOK();
			}
			await page.goto(`/dashboard/career/information?locale=${locale}`);
			const countLabel = locale === "ar-SA" ? "في 5 سير" : "In 5 CVs";
			const openLabel = (name: string) => (locale === "ar-SA" ? `فتح السيرة الذاتية ${name}` : `Open CV ${name}`);
			const trigger = page.getByRole("button", { name: countLabel, exact: true });
			await expect(trigger).toBeVisible();
			if (width === 390) {
				const hit = await trigger.evaluate((element) => {
					const box = element.getBoundingClientRect();
					const after = getComputedStyle(element, "::after");
					return {
						width: Math.max(box.width, Number.parseFloat(after.width) || 0),
						height: Math.max(box.height, Number.parseFloat(after.height) || 0),
					};
				});
				expect(hit.width).toBeGreaterThanOrEqual(44);
				expect(hit.height).toBeGreaterThanOrEqual(44);
			}
			await expect(page.getByRole("link", { name: openLabel(names[0]), exact: true })).toHaveCount(0);
			await trigger.focus();
			await page.keyboard.press("Enter");
			const dialog = page.getByRole("dialog", { name: locale === "ar-SA" ? "السير المرتبطة" : "Linked CVs" });
			await expect(dialog).toBeVisible();
			const links = dialog.getByRole("link");
			await expect(links).toHaveCount(5);
			for (const [index, name] of names.entries()) {
				const link = dialog.locator(`a[href="/builder/${ids[index]}"]`);
				await expect(link).toHaveAccessibleName(openLabel(name));
				await expect(link).toHaveText(name);
				const dimensions = await link.boundingBox();
				expect(dimensions?.width).toBeGreaterThanOrEqual(44);
				expect(dimensions?.height).toBeGreaterThanOrEqual(44);
				expect(
					await link.locator('[dir="auto"]').evaluate((element) => element.scrollWidth <= element.clientWidth),
				).toBe(true);
			}
			const boxes = await links.evaluateAll((elements) =>
				elements.map((element) => {
					const { left, right, top, bottom } = element.getBoundingClientRect();
					return { left, right, top, bottom };
				}),
			);
			for (let i = 0; i < boxes.length; i++)
				for (let j = i + 1; j < boxes.length; j++) {
					const a = boxes[i];
					const b = boxes[j];
					expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true);
				}
			const first = links.first();
			await first.focus();
			await page.keyboard.press("Tab");
			await page.keyboard.press("Shift+Tab");
			await expect(first).toBeFocused();
			expect(
				await first.evaluate(
					(element) => element.matches(":focus-visible") && getComputedStyle(element).outlineStyle !== "none",
				),
			).toBe(true);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
			await settleScreen(page);
			await page.screenshot({ path: info.outputPath("usage-disclosure.png") });
			await page.keyboard.press("Escape");
			await expect(dialog).not.toBeVisible();
			await expect(trigger).toBeFocused();
			await trigger.click();
			await dialog.locator(`a[href="/builder/${ids[1]}"]`).click();
			await expect(page).toHaveURL(new RegExp(`/builder/${ids[1]}$`));
		});
