import { ownerImportPdf } from "../fixtures/owner-import-pdf";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";
import { variantClient } from "../fixtures/variants";

for (const locale of ["ar-SA", "en-US"]) {
	for (const width of [1440, 390]) {
		test(`${locale} ${width}: record header and rail preserve shell geometry`, async ({ authPage: page }) => {
			await page.setViewportSize({ width, height: 1024 });
			await page.goto("/dashboard/applications");
			const role = "Senior engineer مهندس التطبيقات with a long operational title";
			const id = await variantClient(page).applications.create({
				role,
				company: "Record Company",
				salary: "27000–33000 SAR / شهر",
				tags: ["عربي English"],
				notes: "Legacy ملاحظة",
			});
			await variantClient(page).applications.addNote({ id, text: "Saved ملاحظة mixed content" });
			await page.request.post("/api/auth/update-user", {
				data: { uiLocale: locale },
				headers: { origin: new URL(page.url()).origin },
			});
			await page.context().addCookies([{ name: "locale", value: locale, url: new URL(page.url()).origin }]);
			await page.goto(`/dashboard/applications/${id}?locale=${locale}`);
			await settleScreen(page);
			await expect(page.getByRole("heading", { level: 1 })).toHaveText(role);
			await page.evaluate(() => document.fonts.ready);
			await expect(page.getByText("Saved ملاحظة mixed content", { exact: true })).toHaveAttribute("dir", "auto");
			const salary = page.getByText("27000–33000", { exact: true });
			await expect(
				page.getByRole("heading", { name: locale === "ar-SA" ? "تفاصيل" : "Details", exact: true }),
			).toBeVisible();
			await expect(salary.locator("..")).toHaveAttribute("dir", "ltr");
			await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
			await expect(page.locator("#application-next-step")).toHaveJSProperty("tagName", "H2");
			const activity = page.locator("#application-activity").locator("..");
			await expect(activity.locator('button[aria-haspopup="menu"]').first()).toHaveCSS("opacity", "1");
			await expect(activity.getByRole("time").first()).not.toHaveAttribute("dir", "auto");
			const geometry = await page.evaluate(() => {
				const header = document.querySelector(".record-header");
				const heading = header?.querySelector("h1");
				const menu = header?.querySelector("button[aria-label]");
				const columns = document.querySelector(".record-layout");
				const aside = columns?.querySelector("aside");
				if (!header || !heading || !menu || !columns || !aside) throw new Error("Record layout is missing");
				return {
					overflow: document.documentElement.scrollWidth > innerWidth,
					font: getComputedStyle(heading).fontFamily,
					rail: aside.getBoundingClientRect().width,
					aligned: Math.abs(header.getBoundingClientRect().x - columns.getBoundingClientRect().x) < 1,
					menuTop: Math.abs(menu.getBoundingClientRect().top - heading.getBoundingClientRect().top),
				};
			});
			expect(geometry.overflow).toBe(false);
			expect(geometry.font).toContain("Noto Sans");
			expect(geometry.aligned).toBe(true);
			expect(geometry.menuTop).toBeLessThan(48);
			if (width >= 1024) expect(geometry.rail).toBeCloseTo(320, 0);
			const before = await variantClient(page).applications.getById({ id });
			await page
				.context()
				.addCookies([
					{ name: "locale", value: locale === "ar-SA" ? "en-US" : "ar-SA", url: new URL(page.url()).origin },
				]);
			await page.reload();
			await settleScreen(page);
			const after = await variantClient(page).applications.getById({ id });
			expect(after).toEqual(before);
		});
	}
}

test("close, reopen, composer, properties and exact references survive refresh", async ({ authPage: page }) => {
	await page.goto("/dashboard/applications");
	const api = variantClient(page);
	const id = await api.applications.create({
		company: "Private regression company",
		role: "Engineer",
		notes: "Legacy عربي",
		jobDescription: "Saved English وصف",
		salary: "Negotiable + bonus",
	});
	await page.goto(`/dashboard/applications/${id}`);
	await page.getByRole("button", { name: "Edit application note" }).click();
	await page.getByRole("textbox", { name: "Application note", exact: true }).fill("Revised legacy عربي");
	await expect.poll(async () => (await api.applications.getById({ id })).notes).toBe("Revised legacy عربي");
	await page.getByRole("button", { name: "New note", exact: true }).click();
	await page.getByRole("textbox", { name: "Add a note", exact: true }).fill("Timeline English ملاحظة");
	await page.getByRole("button", { name: "Add note", exact: true }).click();
	await expect(page.getByText("Timeline English ملاحظة", { exact: true })).toHaveAttribute("dir", "auto");
	await page.getByRole("button", { name: "Edit tags" }).click();
	await page.getByRole("textbox", { name: "Add a tag" }).fill("Remote بعيد");
	await page.getByRole("dialog").getByRole("button", { name: "Add", exact: true }).click();
	await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
	await expect.poll(async () => (await api.applications.getById({ id })).tags).toEqual(["Remote بعيد"]);
	await page.locator(".record-header").getByRole("button", { name: "More actions", exact: true }).click();
	await page.getByRole("menuitem", { name: "Close application…" }).click();
	await page.getByRole("button", { name: "Cancel", exact: true }).click();
	expect((await api.applications.getById({ id })).status).toBe("saved");
	await page.locator(".record-header").getByRole("button", { name: "More actions", exact: true }).click();
	await page.getByRole("menuitem", { name: "Close application…" }).click();
	await page.getByRole("radio", { name: "I withdrew" }).click();
	await page.getByRole("button", { name: "Close application", exact: true }).click();
	await expect.poll(async () => (await api.applications.getById({ id })).status).toBe("closed");
	await expect(page.getByRole("combobox", { name: "Application stage" })).toHaveCount(0);
	await page.getByRole("button", { name: "Reopen", exact: true }).click();
	await expect.poll(async () => (await api.applications.getById({ id })).status).toBe("applied");
	await page.reload();
	await expect(page.getByText("Revised legacy عربي", { exact: true })).toBeVisible();
	await expect(page.getByText("Timeline English ملاحظة", { exact: true })).toBeVisible();
	await page.getByRole("combobox", { name: "Activity type" }).selectOption("interview");
	await expect(page.getByText("No activity matches this filter")).toBeVisible();
	await page.getByRole("button", { name: "Clear filter" }).click();
	await expect(page.getByText("Timeline English ملاحظة", { exact: true })).toBeVisible();
});

test("source, contacts and staged attachments use acknowledged saves and neutral cancellation", async ({
	authPage: page,
}) => {
	await page.goto("/dashboard/applications");
	const api = variantClient(page);
	const id = await api.applications.create({ company: "Private property company", role: "Engineer" });
	await page.goto(`/dashboard/applications/${id}`);
	await page.getByRole("button", { name: /^Source/ }).click();
	await page.getByRole("textbox", { name: "Source", exact: true }).fill("مصدر Source");
	await page.getByRole("textbox", { name: "Source", exact: true }).press("Enter");
	await expect.poll(async () => (await api.applications.getById({ id })).source).toBe("مصدر Source");
	await page.getByRole("button", { name: "Contacts", exact: true }).click();
	await page.getByRole("button", { name: "Add contact", exact: true }).click();
	await page.getByRole("textbox", { name: /^Name/ }).fill("اسم Name");
	await page.getByRole("button", { name: "Add", exact: true }).click();
	await expect.poll(async () => (await api.applications.getById({ id })).contacts[0]?.name).toBe("اسم Name");
	await page.keyboard.press("Escape");
	await page.getByRole("button", { name: "Manage documents" }).click();
	const upload = { ...ownerImportPdf(), name: "Synthetic.pdf" };
	await page.getByRole("dialog").locator('input[type="file"]').first().setInputFiles(upload);
	expect((await api.applications.getById({ id })).resumeFileUrl).toBeNull();
	await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
	expect((await api.applications.getById({ id })).resumeFileUrl).toBeNull();
	await page.getByRole("button", { name: "Manage documents" }).click();
	await page.getByRole("dialog").locator('input[type="file"]').first().setInputFiles(upload);
	await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
	await expect.poll(async () => (await api.applications.getById({ id })).resumeFileName).toBe("Synthetic.pdf");
});

test("a failed legacy save recovers as a conflict without losing its draft", async ({ authPage: page }) => {
	await page.goto("/dashboard/applications");
	const api = variantClient(page);
	const id = await api.applications.create({
		company: "Private draft company",
		role: "Engineer",
		notes: "Server original",
	});
	await page.goto(`/dashboard/applications/${id}`);
	await page.route("**/api/rpc/applications/update", (route) => route.abort("failed"));
	await page.getByRole("button", { name: "Edit application note" }).click();
	await page.getByRole("textbox", { name: "Application note", exact: true }).fill("Local محفوظ draft");
	await expect(page.getByRole("alert")).toContainText("Your draft remains available");
	const current = await api.applications.getById({ id });
	await api.applications.update({
		id,
		notes: "New server revision",
		expectedUpdatedAt: new Date(current.updatedAt).toISOString(),
		expectedNotesRevision: new Date(current.updatedAt).toISOString(),
	});
	await page.unroute("**/api/rpc/applications/update");
	await page.reload();
	await expect(page.getByRole("textbox", { name: "Application note", exact: true })).toHaveValue("Local محفوظ draft");
	await expect(page.getByRole("alert")).toBeVisible();
	await page.getByRole("button", { name: "Keep my changes", exact: true }).click();
	await expect.poll(async () => (await api.applications.getById({ id })).notes).toBe("Local محفوظ draft");
});
