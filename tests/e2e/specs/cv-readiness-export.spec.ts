import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createSampleResumeFromDashboard } from "../fixtures/resume";
import { expect, test } from "../fixtures/test";
test("downloads the exact PDF checked in the editor despite findings", async ({ authPage: page }, testInfo) => {
	await createSampleResumeFromDashboard(page, testInfo);
	await page.getByRole("tab", { name: /^Check/ }).click();
	const checked = page.locator("[data-pdf-bytes-hash]");
	await expect(checked).toHaveAttribute("data-pdf-bytes-hash", /^[a-f0-9]{64}$/, { timeout: 60000 });
	const hash = await checked.getAttribute("data-pdf-bytes-hash");
	const downloadEvent = page.waitForEvent("download");
	await page.getByRole("button", { name: "Download PDF", exact: true }).click();
	const download = await downloadEvent;
	const path = await download.path();
	if (!path) throw new Error("No PDF download");
	expect(
		createHash("sha256")
			.update(await readFile(path))
			.digest("hex"),
	).toBe(hash);
	await testInfo.attach("checked-pdf", { path, contentType: "application/pdf" });
	const id = new URL(page.url()).pathname.split("/").at(-1);
	const saved = await (await page.request.get(`/api/openapi/resumes/${id}`)).json();
	await page.getByRole("tab", { name: "Write", exact: true }).click();
	await page.getByLabel("Full name", { exact: true }).fill("Changed synthetic artifact");
	await page.getByRole("tab", { name: /^Check/ }).click();
	await expect(checked).not.toHaveAttribute("data-pdf-bytes-hash", hash ?? "");
	expect(saved.data.basics.name).not.toBe("Changed synthetic artifact");
});
