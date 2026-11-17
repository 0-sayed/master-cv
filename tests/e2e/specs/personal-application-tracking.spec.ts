import { expect, test } from "../fixtures/test";
import { variantClient } from "../fixtures/variants";

test("personal applications retain manual notes and owner-maintained stages after reopening", async ({
	authPage: page,
}) => {
	await page.goto("/dashboard/applications");
	const api = variantClient(page);
	const id = await api.applications.create({ company: "شركة تجريبية", role: "مهندس", notes: "ملاحظات عربية مستقلة" });
	await page.goto(`/dashboard/applications?applicationId=${id}`);
	const notes = page.getByRole("textbox", { name: "Notes", exact: true });
	await expect(notes).toHaveValue("ملاحظات عربية مستقلة");
	await notes.fill("ملاحظات عربية معدلة يدويا");
	await expect.poll(async () => (await api.applications.getById({ id })).notes).toBe("ملاحظات عربية معدلة يدويا");
	await page.reload();
	await expect(notes).toHaveValue("ملاحظات عربية معدلة يدويا");
	await page.getByRole("button", { name: "Interview", exact: true }).click();
	await expect.poll(async () => (await api.applications.getById({ id })).status).toBe("interview");
	await page.goto("/dashboard/applications");
	await expect(page.getByText("شركة تجريبية", { exact: true })).toBeVisible();
	await page.goto(`/dashboard/applications?applicationId=${id}`);
	expect((await api.applications.getById({ id })).notes).toBe("ملاحظات عربية معدلة يدويا");
});
