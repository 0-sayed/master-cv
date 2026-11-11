import { loginViaUi } from "../fixtures/auth";
import { expect, test } from "../fixtures/test";

test("history restore survives sign-out and fresh sign-in without changing the other language CV", async ({
	authPage: page,
	account,
	baseURL,
}) => {
	await page.goto("/dashboard");
	await page.getByRole("button", { name: "New CV", exact: true }).click();
	await page.getByRole("button", { name: /^Write from scratch/u }).click();
	await expect(page).toHaveURL(/\/builder\//);
	await page.getByLabel("Full name", { exact: true }).fill("Original reviewed name");
	await expect(page).toHaveURL(/\/builder\//);
	const url = page.url();
	const id = new URL(url).pathname.split("/").at(-1);
	const other = await page.request.post("/api/openapi/resumes", {
		data: { name: "Arabic isolation fixture", tags: [], withSampleData: false, locale: "ar-SA" },
	});
	expect(other.ok()).toBe(true);
	const otherId = await other.json();
	const otherData = (await (await page.request.get(`/api/openapi/resumes/${otherId}`)).json()).data;
	const master = await (await page.request.get("/api/openapi/career/master")).json();
	await expect
		.poll(async () => (await (await page.request.get(`/api/openapi/resumes/${id}`)).json()).data.basics.name)
		.toBe("Original reviewed name");
	await page.getByRole("button", { name: "History", exact: true }).click();
	await page.getByRole("textbox", { name: "Name this version", exact: true }).fill("Before local change");
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await expect(page.getByRole("button", { name: /^Before local change/u })).toBeVisible();
	await page.keyboard.press("Escape");
	await page.getByLabel("Full name", { exact: true }).fill("Latest CV-only name");
	await expect
		.poll(async () => (await (await page.request.get(`/api/openapi/resumes/${id}`)).json()).data.basics.name)
		.toBe("Latest CV-only name");
	await page.getByRole("button", { name: "History", exact: true }).click();
	await page.getByRole("button", { name: /^Before local change/u }).click();
	await page.getByRole("button", { name: "Restore this version", exact: true }).click();
	await expect
		.poll(async () => (await (await page.request.get(`/api/openapi/resumes/${id}`)).json()).data.basics.name)
		.toBe("Original reviewed name");
	await page.keyboard.press("Escape");
	expect((await (await page.request.get(`/api/openapi/resumes/${otherId}`)).json()).data).toEqual(otherData);
	expect(await (await page.request.get("/api/openapi/career/master")).json()).toEqual(master);
	const logout = await page.request.post("/api/auth/sign-out", {
		headers: { origin: baseURL ?? "http://localhost:3030" },
		data: {},
	});
	expect(logout.ok()).toBe(true);
	await page.goto(url);
	await expect(page).toHaveURL(/\/auth\/login/);
	await loginViaUi(page, account);
	await page.goto(url);
	await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Original reviewed name");
});

test("reusing confirmed master facts links the CV while local corrections preserve the master", async ({
	authPage: page,
}) => {
	await page.goto("/dashboard/career/information");
	await page.getByRole("button", { name: "Add skill", exact: true }).click();
	await page.locator('input[name="name"]').fill("Confirmed synthetic skill");
	await page.getByRole("button", { name: "Review changes", exact: true }).click();
	await page.getByRole("button", { name: "Confirm changes", exact: true }).click();
	await expect(page.getByRole("dialog")).not.toBeVisible();
	const master = await (await page.request.get("/api/openapi/career/master")).json();
	await page.goto("/dashboard");
	await page.getByRole("button", { name: "New CV", exact: true }).click();
	await page.getByRole("button", { name: /^Write from scratch/u }).click();
	await expect(page).toHaveURL(/\/builder\//);
	await page.getByRole("button", { name: "Use confirmed career information", exact: true }).click();
	await expect(page.getByText("Confirmed synthetic skill", { exact: true })).toBeVisible();
	await page.getByLabel("Full name", { exact: true }).fill("Reused synthetic CV");
	await expect(page).toHaveURL(/\/builder\//);
	const id = new URL(page.url()).pathname.split("/").at(-1);
	await expect
		.poll(
			async () =>
				(await (await page.request.get(`/api/openapi/resumes/${id}`)).json()).data.sections.skills.items[0]?.name,
		)
		.toBe("Confirmed synthetic skill");
	const cv = await (await page.request.get(`/api/openapi/resumes/${id}`)).json();
	expect(cv.data.sections.skills.items[0].name).toBe("Confirmed synthetic skill");
	const linked = await (await page.request.get("/api/openapi/career/master")).json();
	expect(linked.facts).toEqual(master.facts);
	await expect
		.poll(async () =>
			(await (await page.request.get("/api/openapi/career/master")).json()).links.some(
				(link: { resumeId: string }) => link.resumeId === id,
			),
		)
		.toBe(true);
	await page.getByLabel("Full name", { exact: true }).fill("Local CV correction");
	await expect
		.poll(async () => (await (await page.request.get(`/api/openapi/resumes/${id}`)).json()).data.basics.name)
		.toBe("Local CV correction");
	expect((await (await page.request.get("/api/openapi/career/master")).json()).facts).toEqual(master.facts);
});
