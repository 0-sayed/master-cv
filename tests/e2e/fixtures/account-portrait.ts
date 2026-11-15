import type { Page } from "@playwright/test";
import { privacyDatabase } from "./privacy";
import { expect } from "./test";

/** Legacy/malformed pictures are fixture data, never a bypass in the account update API. */
export async function seedAccountPortrait(page: Page, image: string | null) {
	const response = await page.request.get("/api/auth/get-session");
	await expect(response).toBeOK();
	const { user } = await response.json();
	await privacyDatabase((pool) => pool.query('UPDATE "user" SET image=$1 WHERE id=$2', [image, user.id]));
}
