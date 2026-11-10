import { loginViaUi, logoutViaUi, registerViaUi } from "../fixtures/auth";
import { expect, test } from "../fixtures/test";

test("registers and logs in with email credentials", async ({ page, account }) => {
	let documentRequests = 0;
	page.on("request", (request) => {
		if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests++;
	});
	await registerViaUi(page, account, "/dashboard?from=signup#documents");
	await expect(page.getByRole("heading", { name: "My documents", level: 1 })).toBeVisible();
	await expect(page).toHaveURL(/\/dashboard\?from=signup#documents$/);
	// The real verification link performs a document navigation through Better Auth before password login.
	expect(documentRequests).toBeGreaterThanOrEqual(2);

	await logoutViaUi(page, account);
	await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();

	const beforeLogin = documentRequests;
	await loginViaUi(page, account, "/dashboard?from=login#documents");
	await expect(page.getByRole("heading", { name: "My documents", level: 1 })).toBeVisible();
	await expect(page).toHaveURL(/\/dashboard\?from=login#documents$/);
	expect(documentRequests).toBe(beforeLogin + 1);
});
