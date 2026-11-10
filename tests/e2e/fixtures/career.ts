import type { Page } from "@playwright/test";
import { expect } from "./test";

/** Real persisted facts, scoped to the disposable authPage account. */
export async function createSampleCareer(page: Page) {
	const entries = [
		[
			"experience",
			{
				position: "مهندسة برمجيات أولى",
				company: "شركة تقنية (مثال)",
				dates: { start: "2021-01", end: "2024-01", present: false },
			},
		],
		[
			"experience",
			{
				position: "مهندسة برمجيات",
				company: "شركة ناشئة (مثال)",
				dates: { start: "2019-01", end: "2021-01", present: false },
			},
		],
		[
			"education",
			{
				degree: "بكالوريوس علوم الحاسب",
				school: "جامعة (مثال)",
				dates: { start: "2015-01", end: "2019-01", present: false },
			},
		],
		...["React", "Node.js", "TypeScript", "PostgreSQL", "اختبار الواجهات"].map((name) => ["skills", { name }] as const),
		["languages", { language: "العربية", fluency: "اللغة الأم" }],
		["languages", { language: "الإنجليزية", fluency: "متقدم" }],
	] as const;
	for (const [section, fields] of entries) {
		const facts = [];
		const entityId = crypto.randomUUID();
		for (const [field, value] of Object.entries(fields)) {
			const response = await page.request.post("/api/openapi/career/master/draft", {
				data: {
					fact: {
						section,
						entityId,
						field,
						value,
						source: { kind: "manual", id: entityId, quote: "Synthetic career fixture" },
					},
				},
			});
			await expect(response).toBeOK();
			const fact = await response.json();
			facts.push({ id: fact.id, expectedRevision: fact.revision, expectedDraftRevision: fact.draftRevision });
		}
		const master = await (await page.request.get("/api/openapi/career/master")).json();
		await expect(
			await page.request.post("/api/openapi/career/master/confirm", {
				data: { facts, expectedProfileRevision: master.profileRevision },
			}),
		).toBeOK();
	}
}
