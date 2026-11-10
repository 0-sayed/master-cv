import { createAuthenticatedContext } from "../fixtures/auth";
import { createAccount } from "../fixtures/data";
import { deleteE2EUser } from "../fixtures/db";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

for (const locale of ["ar-SA", "en-US"] as const) {
	test(`${locale}: another tab signing out hides old private UI and clears personal browser data`, async ({
		authPage: page,
		baseURL,
	}) => {
		if (!baseURL) throw new Error("Missing browser URL");
		await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
		await page.goto("/dashboard");
		await settleScreen(page);
		await page.evaluate(() => {
			localStorage.setItem("reactive-resume:unsaved:synthetic-cv", "private-backup");
			localStorage.setItem("letter-sender:synthetic-letter", "private-sender");
			localStorage.setItem("career-context:synthetic-thread", "private-context");
			localStorage.setItem("career:offers-pair", "private-comparison");
			sessionStorage.setItem("career-debrief-draft:synthetic-interview", "private-interview");
		});
		const other = await page.context().newPage();
		try {
			await other.goto("/dashboard");
			await settleScreen(other);
			await other.locator('aside button:has([data-slot="avatar"])').click();
			await other.getByRole("menuitem", { name: locale === "ar-SA" ? "تسجيل الخروج" : "Sign out" }).click();
			await expect(other).toHaveURL(/\/auth\/login/);
			await expect(page.locator('aside button:has([data-slot="avatar"])')).toHaveCount(0);
			await expect(page).toHaveURL(/\/auth\/login/);
			await expect
				.poll(() =>
					page.evaluate(() => ({
						backup: localStorage.getItem("reactive-resume:unsaved:synthetic-cv"),
						sender: localStorage.getItem("letter-sender:synthetic-letter"),
						context: localStorage.getItem("career-context:synthetic-thread"),
						comparison: localStorage.getItem("career:offers-pair"),
						interview: sessionStorage.getItem("career-debrief-draft:synthetic-interview"),
					})),
				)
				.toEqual({ backup: null, sender: null, context: null, comparison: null, interview: null });
		} finally {
			await other.close();
		}
	});
}

test("an account switch reconciles router and reactive identity without showing old documents", async ({
	authPage: page,
	browser,
	playwright,
	baseURL,
}, info) => {
	if (!baseURL) throw new Error("Missing browser URL");
	const next = { ...createAccount(info), name: "Second Synthetic Owner" };
	const request = await playwright.request.newContext({ baseURL });
	const context = await createAuthenticatedContext(browser, request, next, baseURL);
	try {
		await page.goto("/dashboard");
		await settleScreen(page);
		// Switch the shared browser cookie through real auth endpoints, then deliver Better Auth's actual cross-tab signal.
		const cookies = await context.cookies();
		await page.context().clearCookies();
		await page.context().addCookies(cookies);
		const other = await page.context().newPage();
		await other.goto("/dashboard");
		await settleScreen(other);
		await other.getByRole("link", { name: "Settings", exact: true }).click();
		// A real update-user broadcasts the session notification to the first tab.
		await other.getByRole("textbox", { name: "Name", exact: true }).fill(next.name + " Updated");
		await other.getByRole("textbox", { name: "Name", exact: true }).blur();
		await expect(page.locator('aside button:has([data-slot="avatar"])')).toContainText(next.name);
		await other.close();
	} finally {
		await context.close();
		await request.dispose();
		await deleteE2EUser(next);
	}
});

test("notes survive a failed save and reload, then save only with server acknowledgment", async ({
	authPage: page,
}) => {
	const response = await page.request.post("/api/openapi/applications", {
		data: { company: "Synthetic Notes", role: "Engineer", status: "saved" },
	});
	await expect(response).toBeOK();
	const id = (await response.json()) as string;
	await page.goto(`/dashboard/applications/${id}`);
	if (await page.getByText("Details", { exact: true }).isVisible())
		await page.getByText("Details", { exact: true }).click();
	const field = page.getByRole("textbox", { name: "Notes", exact: true });
	await expect(field).toBeVisible();
	await page.route("**/api/rpc/applications/update**", (route) => route.abort("failed"));
	await field.fill("Durable synthetic notes");
	await expect(page.getByRole("button", { name: "Retry save", exact: true })).toBeVisible();
	await page.reload();
	if (await page.getByText("Details", { exact: true }).isVisible())
		await page.getByText("Details", { exact: true }).click();
	await expect(field).toHaveValue("Durable synthetic notes");
	await page.unroute("**/api/rpc/applications/update**");
	if (await page.getByRole("button", { name: "Retry save", exact: true }).isVisible())
		await page.getByRole("button", { name: "Retry save", exact: true }).click();
	await expect
		.poll(async () => {
			const fresh = await page.request.get(`/api/openapi/applications/${id}`);
			return (await fresh.json()).notes;
		})
		.toBe("Durable synthetic notes");
});

test("closing an action toast leaves data intact; explicit confirmation waits for acknowledgment", async ({
	authPage: page,
}) => {
	const fact = "A synthetic fact retained until an acknowledged deletion.";
	await page.goto("/dashboard/career/knowledge/facts");
	await page.getByLabel("New fact").fill(fact);
	await page.getByLabel("New fact").press("Enter");
	await expect(page.getByText(fact, { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Forget", exact: true }).click();
	await expect(page.getByText(fact, { exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Confirm", exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Confirm", exact: true })).toBeHidden({ timeout: 10_000 });
	await page.reload();
	await expect(page.getByText(fact, { exact: true })).toBeVisible();
	let acknowledge!: () => void;
	const held = new Promise<void>((resolve) => {
		acknowledge = resolve;
	});
	await page.route("**/api/rpc/career/forgetFact**", async (route) => {
		await held;
		await route.continue();
	});
	try {
		await page.getByRole("button", { name: "Forget", exact: true }).click();
		await page.getByRole("button", { name: "Confirm", exact: true }).click();
		await expect(page.getByText("Saving...", { exact: true })).toBeVisible();
		await expect(page.getByText(fact, { exact: true })).toBeVisible();
		acknowledge();
		await expect(page.getByText("Fact forgotten", { exact: true })).toBeVisible();
		await expect(page.getByText(fact, { exact: true })).toHaveCount(0);
		await page.reload();
		await expect(page.getByText(fact, { exact: true })).toHaveCount(0);
	} finally {
		acknowledge();
	}
});

test("an interview draft requires explicit restore and is bound to its owner and base", async ({ authPage: page }) => {
	const response = await page.request.post("/api/openapi/applications", {
		data: { company: "Synthetic Debrief", role: "Engineer", status: "interview" },
	});
	await expect(response).toBeOK();
	const id = (await response.json()) as string;
	await page.goto(`/dashboard/applications/${id}/debrief`);
	const question = page.getByRole("textbox", { name: "What did they ask?", exact: true });
	await question.fill("A private synthetic interview question");
	await page.reload();
	await expect(question).toHaveValue("");
	await page.getByRole("button", { name: "Restore draft", exact: true }).click();
	await expect(question).toHaveValue("A private synthetic interview question");
	await page.evaluate(() => {
		const key = Object.keys(sessionStorage).find((name) => name.startsWith("career-debrief-draft:"));
		if (!key) throw new Error("Missing stored interview draft");
		const raw = sessionStorage.getItem(key);
		if (!raw) throw new Error("Missing stored interview envelope");
		const envelope = JSON.parse(raw);
		sessionStorage.setItem(key, JSON.stringify({ ...envelope, baseRevision: "obsolete-revision" }));
	});
	await page.reload();
	await expect(question).toHaveValue("");
	await expect(page.getByRole("button", { name: "Restore draft", exact: true })).toHaveCount(0);
});
