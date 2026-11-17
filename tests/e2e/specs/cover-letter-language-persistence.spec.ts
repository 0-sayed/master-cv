import { expect, test } from "../fixtures/test";
import { variantClient } from "../fixtures/variants";

test("Arabic and English letters preserve independent manual edits across interface changes and reopening", async ({
	authPage: page,
}) => {
	await page.goto("/dashboard");
	const api = variantClient(page);
	const ar = await api.coverLetters.create({
		name: "خطاب عربي",
		documentLocale: "ar-SA",
		content: "<p>نص عربي يدوي مستقل.</p>",
	});
	const en = await api.coverLetters.create({
		name: "English letter",
		documentLocale: "en-US",
		content: "<p>Independent English manual text.</p>",
	});
	await page.goto(`/builder/letter/${ar.id}`);
	await expect(page.getByRole("button", { name: "Create a separate English letter", exact: true })).toBeVisible();
	await page.context().addCookies([{ name: "locale", value: "ar-SA", url: new URL(page.url()).origin }]);
	await page.reload();
	expect(await api.coverLetters.getById({ id: ar.id })).toMatchObject({
		content: ar.content,
		style: { metadata: { page: { locale: "ar-SA" } } },
	});
	await page.goto(`/builder/letter/${en.id}`);
	await page.reload();
	expect(await api.coverLetters.getById({ id: en.id })).toMatchObject({
		content: en.content,
		style: { metadata: { page: { locale: "en-US" } } },
	});
});
