import { expect, test } from "../fixtures/test";
test("anonymous PDF checks are denied and the public checker has no upload", async ({ page }) => {
	const response = await page.request.post("/api/openapi/pdf-checks", {
		multipart: {
			resumeId: "foreign",
			expectedUpdatedAt: "2026-11-11T00:00:00Z",
			file: { name: "synthetic.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-synthetic") },
		},
	});
	expect(response.status()).toBe(401);
	await page.goto("/ats-checker");
	await expect(page.locator("input[type=file]")).toHaveCount(0);
	await expect(page.getByRole("heading", { name: "Check your CV in your private workspace" })).toBeVisible();
});
