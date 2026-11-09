import type { E2EAccount } from "./data";
import type { APIRequestContext, Browser, BrowserContext, Page } from "@playwright/test";
import { capturedAuthLink } from "./mail";

async function assertAuthResponse(response: Awaited<ReturnType<APIRequestContext["post"]>>) {
	if (response.ok()) return;

	throw new Error(`Authentication request failed with ${response.status()}: ${await response.text()}`);
}

export async function registerViaUi(page: Page, account: E2EAccount, callbackURL?: string) {
	await page.goto(`/auth/register${callbackURL ? `?callbackURL=${encodeURIComponent(callbackURL)}` : ""}`);
	await page.getByRole("textbox", { name: "Name", exact: true }).fill(account.name);
	await page.getByLabel("Username").fill(account.username);
	await page.getByLabel(/^Email address$/i).fill(account.email);
	await page.getByLabel("Password", { exact: true }).fill(account.password);
	await page.getByRole("checkbox").check();
	await page.getByRole("button", { name: "Sign up" }).click();
	await page.waitForURL(/\/auth\/verify-email/);
	await page.goto(await capturedAuthLink(account.email, "verification"));
	await page.waitForURL(/\/auth\/login/);
	await page.getByLabel(/^Email address$/i).fill(account.email);
	await page.getByLabel("Password", { exact: true }).fill(account.password);
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
	await page.waitForURL(/\/dashboard/);
	if (new URL(page.url()).pathname === "/dashboard/welcome")
		await page.getByRole("button", { name: "Explore first" }).click();
}

export async function loginViaUi(page: Page, account: E2EAccount, path = "/auth/login") {
	await page.goto(path);
	await page.getByLabel(/^Email address$/i).fill(account.email);
	await page.getByLabel("Password", { exact: true }).fill(account.password);
	await page.getByRole("button", { name: "Sign in" }).click();
	await page.waitForURL(/\/dashboard/);
	if (new URL(page.url()).pathname === "/dashboard/welcome")
		await page.getByRole("button", { name: "Explore first" }).click();
}

export async function logoutViaUi(page: Page, account: E2EAccount) {
	// The avatar row at the foot of the sidebar opens the account menu.
	await page
		.getByRole("complementary")
		.getByRole("button", { name: new RegExp(account.name) })
		.click();
	await page.getByRole("menuitem", { name: "Sign out" }).click();
	await page.waitForURL(/\/auth\/login/);
}

export async function registerViaApi(request: APIRequestContext, account: E2EAccount, baseURL: string) {
	const response = await request.post("/api/auth/sign-up/email", {
		headers: {
			origin: baseURL,
			referer: `${baseURL}/auth/register`,
		},
		data: {
			name: account.name,
			email: account.email,
			password: account.password,
			username: account.username,
			displayUsername: account.username,
			callbackURL: "/dashboard",
		},
	});

	await assertAuthResponse(response);
}

export async function createAuthenticatedContext(
	browser: Browser,
	request: APIRequestContext,
	account: E2EAccount,
	baseURL: string,
): Promise<BrowserContext> {
	await registerViaApi(request, account, baseURL);
	await request.get(await capturedAuthLink(account.email, "verification"));
	await assertAuthResponse(
		await request.post("/api/auth/sign-in/email", {
			headers: { origin: baseURL },
			data: { email: account.email, password: account.password },
		}),
	);
	// Most inherited specs start at a document deep link. Complete onboarding through its real public contract.
	await assertAuthResponse(
		await request.post("/api/openapi/career/personal-workspace/welcome", { headers: { origin: baseURL }, data: {} }),
	);

	const context = await browser.newContext({
		baseURL,
		storageState: await request.storageState(),
	});
	await context.addCookies([{ name: "locale", value: "en-US", url: baseURL }]);
	return context;
}
