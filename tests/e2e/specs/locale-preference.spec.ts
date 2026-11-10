import { createAccount } from "../fixtures/data";
import { deleteE2EUser } from "../fixtures/db";
import { capturedAuthLink } from "../fixtures/mail";
import { expect, test } from "../fixtures/test";

test("validates and isolates a persisted UI locale, including a fresh cookie-free visit", async ({
	authPage,
	browser,
	account,
	baseURL,
}, testInfo) => {
	const request = authPage.context().request;
	const headers = { origin: baseURL ?? "http://localhost:3000" };
	const session = async () =>
		(await (await request.get("/api/auth/get-session")).json()) as { user: { email: string; uiLocale: string | null } };
	// Older clients omit the new field and keep the existing nullable preference.
	expect((await session()).user.uiLocale).toBeNull();
	for (const uiLocale of ["de-DE", "en-GB", "zu-ZA", "../../en-US", ""]) {
		const response = await request.post("/api/auth/update-user", { headers, data: { uiLocale } });
		expect(response.ok()).toBe(false);
	}
	expect((await request.post("/api/auth/update-user", { headers, data: { uiLocale: "en-US" } })).ok()).toBe(true);
	expect((await session()).user).toMatchObject({ email: account.email, uiLocale: "en-US" });
	const state = await authPage.context().storageState();
	state.cookies = state.cookies.filter((cookie) => cookie.name !== "locale");
	const fresh = await browser.newContext({ baseURL, storageState: state });
	const other = await browser.newContext({ baseURL });
	const second = createAccount(testInfo);
	try {
		// The initial server HTML must agree with the account even before client-side locale loading.
		const home = await fresh.request.get("/");
		expect(home.headers()["cache-control"]).toBe("private, no-store");
		expect(await home.text()).toMatch(/<html[^>]*lang="en-US"/);
		const page = await fresh.newPage();
		await page.goto("/dashboard/settings/preferences");
		await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
		const denied = await other.request.post("/api/auth/update-user", { headers, data: { uiLocale: "ar-SA" } });
		expect(denied.status()).toBe(401);
		expect(
			(
				await other.request.post("/api/auth/sign-up/email", {
					headers,
					data: { ...second, displayUsername: second.username },
				})
			).ok(),
		).toBe(true);
		await other.request.get(await capturedAuthLink(second.email, "verification"));
		expect(
			(
				await other.request.post("/api/auth/sign-in/email", {
					headers,
					data: { email: second.email, password: second.password },
				})
			).ok(),
		).toBe(true);
		expect((await other.request.post("/api/auth/update-user", { headers, data: { uiLocale: "ar-SA" } })).ok()).toBe(
			true,
		);
		expect((await (await other.request.get("/api/auth/get-session")).json()).user).toMatchObject({
			email: second.email,
			uiLocale: "ar-SA",
		});
		expect((await session()).user.uiLocale).toBe("en-US");
	} finally {
		await fresh.close();
		await other.close();
		await deleteE2EUser(second);
	}
});
