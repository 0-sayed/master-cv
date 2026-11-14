import { expect, test } from "../fixtures/test";
import {
	seedVariantReview,
	variantClient,
	startVariantReview,
	seedTailoringReview,
	launchTailoringReview,
} from "../fixtures/variants";
test("exact pasted job survives refresh, verified findings do not change the CV, and copies are intentional", async ({
	authPage: page,
}, info) => {
	const resumeId = await seedVariantReview(page, info);
	const api = variantClient(page);
	const original = await api.resume.getById({ id: resumeId });
	const text = "  TypeScript required.\nلا يشترط SAP.  ";
	await page.goto(`/dashboard/resumes/${resumeId}/job`);
	await page.getByLabel("Job title", { exact: true }).fill("Product engineer");
	await page.getByLabel("Job ad", { exact: true }).fill(text);
	await page.getByRole("button", { name: "Compare", exact: true }).click();
	await expect(page.getByText("Literal text coverage", { exact: true })).toBeVisible();
	await page.reload();
	const report = await api.career.jobTargets.evidence({ resumeId });
	if (!report.selection) throw new Error("Expected saved selection");
	expect(report.job?.text).toBe(text);
	expect(report.semantic.state).not.toBe("complete");
	expect((await api.resume.getById({ id: resumeId })).updatedAt).toEqual(original.updatedAt);
	await page.getByRole("button", { name: "Review job evidence", exact: true }).click();
	await page.getByRole("dialog").getByRole("button", { name: "Start review", exact: true }).click();
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await expect
		.poll(async () => (await api.career.jobTargets.evidence({ resumeId })).semantic.state, { timeout: 30000 })
		.toBe("waiting-review");
	const semantic = (await api.career.jobTargets.evidence({ resumeId })).semantic;
	if (!("operationId" in semantic)) throw new Error("Review was not started");
	const operationId = semantic.operationId;
	const review = await api.ai.variantReview.get({ operationId });
	await api.ai.variantReview.decide({
		operationId,
		requestKey: crypto.randomUUID(),
		expectedUpdatedAt: review.updatedAt,
		expectedDecisionId: review.latestDecisionId,
		subjectIds: ["report"],
		decision: "accept",
	});
	expect((await api.career.jobTargets.evidence({ resumeId })).semantic.state).toBe("complete");
	const copy = await api.resume.variants.create({
		sourceResumeId: resumeId,
		expectedUpdatedAt: original.updatedAt.toISOString(),
		variantKind: "job",
		requestKey: crypto.randomUUID(),
		jobId: report.selection.jobId,
		jobRevision: report.selection.jobRevision,
	});
	expect((await api.resume.getById({ id: copy.resumeId })).data).toEqual(original.data);
	expect((await api.resume.getById({ id: resumeId })).data).toEqual(original.data);
	await page.reload();
	const term = page
		.locator("details")
		.filter({ has: page.locator("summary", { hasText: /typescript.*Found in CV/i }) })
		.first();
	await term.locator("summary").click();
	await term.getByRole("link", { name: "Show in CV" }).first().click();
	await expect(page).toHaveURL(/builder\/.*source=/);
	await expect(page.locator("#sidebar-summary")).toBeVisible();
});
test("a changed selection fences a delayed semantic review", async ({ authPage: page }, info) => {
	const id = await seedVariantReview(page, info);
	const api = variantClient(page);
	const cv = await api.resume.getById({ id });
	const job = await api.career.jobTargets.save({ role: "Engineer", employer: "", text: "TypeScript required." });
	const selection = await api.career.jobTargets.select({
		resumeId: id,
		expectedUpdatedAt: cv.updatedAt.toISOString(),
		jobId: job.jobId,
		jobRevision: job.revision,
		expectedSelectionRevision: null,
	});
	const prepared = await api.ai.variantReview.prepare({
		kind: "review.job-evidence",
		resumeId: id,
		expectedUpdatedAt: cv.updatedAt.toISOString(),
		jobId: job.jobId,
		jobRevision: job.revision,
		expectedSelectionRevision: selection.revision,
	});
	const operationId = await startVariantReview(page, prepared);
	const next = await api.career.jobTargets.save({
		jobId: job.jobId,
		expectedRevision: job.revision,
		role: "Changed",
		employer: "",
		text: "SAP required.",
	});
	await api.career.jobTargets.select({
		resumeId: id,
		expectedUpdatedAt: cv.updatedAt.toISOString(),
		jobId: next.jobId,
		jobRevision: next.revision,
		expectedSelectionRevision: selection.revision,
	});
	expect((await api.ai.variantReview.get({ operationId })).stale).toBe(true);
});

test("tailoring proposals accept, edit, reject and undo persist only the selected copy across reload", async ({
	authPage: page,
}, info) => {
	const { sourceId, copyId, original } = await seedTailoringReview(page, info);
	const api = variantClient(page);
	await launchTailoringReview(page, copyId);
	const proposals = page.locator("[data-proposal-index]");
	await expect(proposals).toHaveCount(3, { timeout: 30000 });
	const summary = proposals.filter({ hasText: "Did not manage a budget." });
	const dashboard = proposals.filter({ hasText: "Built TypeScript dashboards." });
	const pipeline = proposals.filter({ hasText: "Built TypeScript pipelines." });
	expect((await api.resume.getById({ id: copyId })).data).toEqual(original.data);
	await summary.getByRole("button", { name: "Accept", exact: true }).click();
	await expect(summary.getByText("Applied", { exact: true })).toBeVisible();
	await page.reload();
	await expect(summary.getByText("Applied", { exact: true })).toBeVisible();
	expect((await api.resume.getById({ id: copyId })).data.summary.content).toBe(
		"<p>Developed TypeScript services. Did not manage a budget.</p>",
	);
	await page.getByRole("button", { name: "Undo", exact: true }).click();
	await expect(summary.getByRole("button", { name: "Accept", exact: true })).toBeVisible();
	expect((await api.resume.getById({ id: copyId })).data).toEqual(original.data);
	await summary.getByRole("button", { name: "Accept", exact: true }).click();
	await expect(summary.getByText("Applied", { exact: true })).toBeVisible();
	await dashboard.getByRole("button", { name: "Edit", exact: true }).click();
	await page.getByRole("textbox", { name: "Edited text", exact: true }).fill("Developed dashboards using TypeScript.");
	await page.getByRole("button", { name: "Save wording", exact: true }).click();
	await expect(dashboard.getByText("Applied", { exact: true })).toBeVisible();
	await pipeline.getByRole("button", { name: "Reject", exact: true }).click();
	await expect(pipeline.getByText("Rejected", { exact: true })).toBeVisible();
	await page.reload();
	await expect(dashboard.getByText("Applied", { exact: true })).toBeVisible();
	await expect(pipeline.getByText("Rejected", { exact: true })).toBeVisible();
	const saved = await api.resume.getById({ id: copyId });
	expect(saved.data.summary.content).toBe("<p>Developed TypeScript services. Did not manage a budget.</p>");
	expect(saved.data.sections.projects.items.map((item) => item.description)).toEqual([
		"<p>Developed dashboards using TypeScript.</p>",
		"<p>Built TypeScript pipelines.</p>",
	]);
	expect((await api.resume.getById({ id: sourceId })).data).toEqual(original.data);
	const evidence = await api.career.jobTargets.evidence({ resumeId: copyId });
	expect(evidence.selection).not.toBeNull();
});
