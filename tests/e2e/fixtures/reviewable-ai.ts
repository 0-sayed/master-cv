import type { Page, TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";
import { Pool } from "pg";
import { createSampleResumeFromDashboard } from "./resume";

export async function seedReview(
	page: Page,
	testInfo: TestInfo,
	locale: "en-US" | "ar-SA" = "en-US",
	documentLocale: "en-US" | "ar-SA" = "en-US",
) {
	await page.request.post("/api/auth/update-user", {
		data: { uiLocale: locale },
		headers: { origin: String(testInfo.project.use.baseURL) },
	});
	await createSampleResumeFromDashboard(page, testInfo);
	const resumeId = new URL(page.url()).pathname.split("/").at(-1);
	if (!resumeId) throw new Error("Expected resume URL");
	const current = await (await page.request.get(`/api/openapi/resumes/${resumeId}`)).json();
	current.data.summary.content = documentLocale === "ar-SA" ? "<p>بنيت خدمات.</p>" : "<p>Built services.</p>";
	current.data.metadata.page.locale = documentLocale;
	const saved = await page.request.put(`/api/openapi/resumes/${resumeId}`, {
		data: { data: current.data, expectedUpdatedAt: current.updatedAt },
	});
	expect(saved.ok()).toBe(true);
	await seedReviewBudget();
	await page.reload();
	return resumeId;
}
export async function seedReviewBudget() {
	const pool = new Pool({ connectionString: process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL });
	try {
		await pool.query(
			"INSERT INTO ai_platform_budget(id,route_id,route_revision,window_date,cap_micros,request_cap_micros,concurrency) VALUES ('t006-browser','synthetic','1',(now() AT TIME ZONE 'UTC')::date,100000,10000,2) ON CONFLICT DO NOTHING",
		);
	} finally {
		await pool.end();
	}
}
export type ReviewTab = "ats" | "writing" | "ai";
export async function openReview(page: Page, width = 1440, tab: ReviewTab = "ats") {
	if (width >= 640) await page.getByRole("tab", { name: /^(Review|مراجعة)$/u }).click();
	else
		await page
			.getByRole("navigation", { name: /Editor views|طرق عرض المحرر/u })
			.getByRole("button", { name: /^(Review|مراجعة)$/u })
			.click();
	const expand = page.getByRole("button", { name: /^(Open full review|فتح المراجعة الكاملة)$/u });
	if (await expand.isVisible()) await expand.click();
	const names = {
		ats: /^(ATS check|فحص ATS)(?: \d+)?$/u,
		writing: /^(Data check|فحص البيانات) \d+$/u,
		ai: /^(AI|الذكاء الاصطناعي) (?:\d+|AI unavailable|الذكاء الاصطناعي غير متاح)$/u,
	};
	const reviewTab = page.getByRole("tab", { name: names[tab] });
	if ((await reviewTab.getAttribute("aria-selected")) !== "true") await reviewTab.click();
	await expect(page.getByRole("region", { name: /^(Review findings|ملاحظات المراجعة)$/u })).toBeVisible();
}
export async function openWriting(page: Page, width = 1440) {
	await openReview(page, width, "ai");
}
export async function startReview(page: Page) {
	await page.getByRole("button", { name: /^(Review wording|مراجعة الصياغة)$/u }).click();
	await page
		.getByRole("dialog")
		.getByRole("button", { name: /^(Start review|بدء المراجعة)$/u })
		.click();
	await expect(page.getByTestId("durable-review")).toBeVisible({ timeout: 25_000 });
}
