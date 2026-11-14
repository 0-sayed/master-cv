import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";
import { seedVariantReview, variantClient, startVariantReview } from "../fixtures/variants";
test("translation decisions remain pending until atomic approval, survive reload and undo locally", async ({
	authPage: page,
}, info) => {
	const id = await seedVariantReview(page, info);
	const api = variantClient(page);
	const source = await api.resume.getById({ id });
	const copy = await api.resume.variants.create({
		sourceResumeId: id,
		expectedUpdatedAt: source.updatedAt.toISOString(),
		variantKind: "language",
		targetLocale: "ar-SA",
		requestKey: crypto.randomUUID(),
	});

	const prepared = await api.ai.variantReview.prepare({
		kind: "review.translation",
		resumeId: copy.resumeId,
		expectedUpdatedAt: copy.updatedAt,
		expectedSourceRevision: source.updatedAt.toISOString(),
	});
	const operationId = await startVariantReview(page, prepared);
	const decide = async (
		subjectIds: string[],
		decision: "accept" | "accept_edited" | "undo",
		extras: { editedText?: string; undoDecisionId?: string } = {},
	) => {
		const view = await api.ai.variantReview.get({ operationId });
		return api.ai.variantReview.decide({
			operationId,
			requestKey: crypto.randomUUID(),
			expectedUpdatedAt: view.updatedAt,
			expectedDecisionId: view.latestDecisionId,
			subjectIds,
			decision,
			...extras,
		});
	};
	let review = await api.ai.variantReview.get({ operationId });
	for (const term of review.terms.terms) await decide([term.id], "accept_edited", { editedText: term.value });
	review = await api.ai.variantReview.get({ operationId });
	for (const segment of Object.keys(review.segments)) await decide([segment], "accept");
	expect((await api.resume.getById({ id: copy.resumeId })).data).toEqual(source.data);
	await page.goto(`/dashboard/resumes/${id}/languages`);
	await page.reload();
	const saved = await decide(["translation"], "accept");
	expect((await api.resume.getById({ id: copy.resumeId })).data.metadata.page.locale).toBe("ar-SA");
	expect((await api.resume.getById({ id })).data).toEqual(source.data);
	await decide(["translation"], "undo", { undoDecisionId: saved.decisionId });
	expect((await api.resume.getById({ id: copy.resumeId })).data).toEqual(source.data);
});

for (const locale of ["en-US", "ar-SA"] as const)
	for (const width of [1440, 390])
		test(`summary and job review launch with localized clarification at ${locale} ${width}`, async ({
			authPage: page,
		}, info) => {
			await page.setViewportSize({ width, height: 900 });
			const id = await seedVariantReview(page, info, true);
			const api = variantClient(page);
			await expect(
				await page.request.post("/api/auth/update-user", {
					data: { uiLocale: locale },
					headers: { origin: String(info.project.use.baseURL) },
				}),
			).toBeOK();
			await page.goto(`/builder/${id}`);
			await page
				.getByRole("button", { name: /^(Summary|الملخّص)$/ })
				.first()
				.click();
			await page
				.locator("summary")
				.filter({ hasText: /Select facts for the summary|اختر حقائق/ })
				.click();
			await page.getByRole("checkbox").first().check();
			await page.getByRole("button", { name: /^(Review summary|مراجعة النبذة)$/ }).click();
			await page
				.getByRole("dialog")
				.getByRole("button", { name: /^(Start review|بدء المراجعة)$/ })
				.click();
			await expect(page.getByRole("dialog")).toHaveCount(0);
			await expect(page.getByRole("button", { name: /^(Accept|قبول)$/ }).first()).toBeVisible({ timeout: 30000 });
			await settleScreen(page);
			await page.screenshot({ path: info.outputPath("summary-review.png"), fullPage: true });
			await page.goto(`/dashboard/resumes/${id}/job`);
			await page.getByLabel(/^(Job title|المسمى الوظيفي)$/).fill("Engineer");
			await page.getByLabel(/^(Job ad|إعلان الوظيفة)$/).fill("TypeScript and SAP required");
			await page.getByRole("button", { name: /^(Compare|قارن|مقارنة)$/ }).click();
			await page.getByRole("button", { name: /^(Review job evidence|مراجعة أدلة الوظيفة)$/ }).click();
			await page
				.getByRole("dialog")
				.getByRole("button", { name: /^(Start review|بدء المراجعة)$/ })
				.click();
			await expect(page.getByRole("dialog")).toHaveCount(0);
			await expect
				.poll(async () => (await api.career.jobTargets.evidence({ resumeId: id })).semantic.state, { timeout: 30000 })
				.toBe("waiting-review");
			await page.getByRole("button", { name: /^(Add information|إضافة معلومة)$/ }).click();
			const dialog = page.getByRole("dialog");
			await expect(dialog.getByText("TypeScript and SAP required", { exact: true })).toBeVisible();
			await expect(dialog.getByText("TypeScript and SAP required", { exact: true })).toHaveAttribute("dir", "auto");
			await expect(
				dialog.getByText(
					locale === "ar-SA"
						? "ما الخبرة أو الدراسة أو المشروع الذي يمكنك تأكيده لهذا المتطلب؟"
						: "What experience, study or project can you confirm for this requirement?",
					{ exact: true },
				),
			).toBeVisible();
			await expect(page.getByText(/no_evidence/)).toHaveCount(0);
			await settleScreen(page);
			await page.screenshot({ path: info.outputPath("job-clarification.png"), fullPage: true });
		});

test("first translation rejection and undo preserve pending terms and readable local names", async ({
	authPage: page,
}, info) => {
	const id = await seedVariantReview(page, info, true);
	const api = variantClient(page);
	const source = await api.resume.getById({ id });
	const copy = await api.resume.variants.create({
		sourceResumeId: id,
		expectedUpdatedAt: source.updatedAt.toISOString(),
		variantKind: "language",
		targetLocale: "ar-SA",
		requestKey: crypto.randomUUID(),
	});
	const prepared = await api.ai.variantReview.prepare({
		kind: "review.translation",
		resumeId: copy.resumeId,
		expectedUpdatedAt: copy.updatedAt,
		expectedSourceRevision: source.updatedAt.toISOString(),
	});
	const operationId = await startVariantReview(page, prepared);
	await page.goto(`/dashboard/resumes/${id}/languages`);
	await expect(page.getByText(/\[LOCAL_\d+\]/)).toHaveCount(0);
	await page.getByRole("button", { name: "Reject", exact: true }).first().click();
	await expect(page.getByText("Rejected", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Undo", exact: true }).click();
	await expect(page.getByText("Rejected", { exact: true })).toHaveCount(0);
	expect((await api.ai.variantReview.get({ operationId })).latestDecisionId).not.toBeNull();
	await settleScreen(page);
	await page.screenshot({ path: info.outputPath("translation-local-names.png"), fullPage: true });
	for (let i = 0; i < 2; i++) {
		await page.getByRole("button", { name: "Confirm term", exact: true }).nth(i).click();
		const dialog = page.getByRole("dialog");
		await dialog.getByRole("button", { name: "Confirm term", exact: true }).click();
		await expect(dialog).toHaveCount(0);
	}
	await expect(page.getByText(/\[LOCAL_\d+\]/)).toHaveCount(0);
	for (let i = 0; i < 4; i++) {
		await page.getByRole("button", { name: "Accept", exact: true }).first().click();
		await expect
			.poll(
				async () =>
					Object.values((await api.ai.variantReview.get({ operationId })).segments).filter(
						(segment) => segment.status === "accepted",
					).length,
			)
			.toBe(i + 1);
	}
	await page.getByRole("button", { name: "Approve language copy", exact: true }).click();
	await expect
		.poll(async () => (await api.resume.getById({ id: copy.resumeId })).data.metadata.page.locale)
		.toBe("ar-SA");
	await expect(page.getByText(/\[LOCAL_\d+\]/)).toHaveCount(0);
	const saved = await api.resume.getById({ id: copy.resumeId });
	expect(saved.data.sections.education.items[0]?.school).toBe("Synthetic Institute");
	expect(saved.data.sections.education.items[0]?.degree).toBe("Training certificate");
	expect(JSON.stringify(saved.data)).not.toMatch(/\[LOCAL_\d+\]/);
});

for (const width of [1440, 390])
	test(`terminology recovery keeps the draft and returns focus at ${width}`, async ({ authPage: page }, info) => {
		await page.setViewportSize({ width, height: 900 });
		const id = await seedVariantReview(page, info, true);
		const api = variantClient(page);
		const source = await api.resume.getById({ id });
		const copy = await api.resume.variants.create({
			sourceResumeId: id,
			expectedUpdatedAt: source.updatedAt.toISOString(),
			variantKind: "language",
			targetLocale: "ar-SA",
			requestKey: crypto.randomUUID(),
		});
		const prepared = await api.ai.variantReview.prepare({
			kind: "review.translation",
			resumeId: copy.resumeId,
			expectedUpdatedAt: copy.updatedAt,
			expectedSourceRevision: source.updatedAt.toISOString(),
		});
		const operationId = await startVariantReview(page, prepared);
		await page.goto(`/dashboard/resumes/${id}/languages`);
		await expect(page.getByText("Pending", { exact: true }).first()).toBeVisible();
		const trigger = page.getByRole("button", { name: "Confirm term" }).first();
		await trigger.click();
		const overlay = page.getByRole("dialog");
		await expect(overlay.getByText("Synthetic Institute", { exact: true })).toBeVisible();
		const input = overlay.getByRole("textbox", { name: "Reviewed term" });
		await input.fill("");
		await expect(overlay.getByRole("button", { name: "Confirm term" })).toBeDisabled();
		await input.fill("Official Synthetic Institute");
		await page.screenshot({ path: info.outputPath("term-correction.png"), fullPage: true });
		await overlay.getByRole("button", { name: "Cancel", exact: true }).click();
		await expect(overlay).toHaveCount(0);
		await expect(trigger).toBeFocused();
		expect(
			(await api.ai.variantReview.get({ operationId })).terms.terms.every((term) => term.status === "pending"),
		).toBe(true);
		expect((await api.resume.getById({ id: copy.resumeId })).data).toEqual(source.data);
	});

test("history restores an earlier language-copy revision after reload without changing its source", async ({
	authPage: page,
}, info) => {
	const id = await seedVariantReview(page, info);
	const api = variantClient(page);
	const source = await api.resume.getById({ id });
	const copy = await api.resume.variants.create({
		sourceResumeId: id,
		expectedUpdatedAt: source.updatedAt.toISOString(),
		variantKind: "language",
		targetLocale: "ar-SA",
		requestKey: crypto.randomUUID(),
	});
	await page.goto(`/builder/${copy.resumeId}`);
	await page.getByLabel("Full name", { exact: true }).fill("Earlier synthetic language name");
	await expect
		.poll(async () => (await api.resume.getById({ id: copy.resumeId })).data.basics.name)
		.toBe("Earlier synthetic language name");
	await page.getByRole("button", { name: "History", exact: true }).click();
	await page.getByRole("textbox", { name: "Name this version", exact: true }).fill("Reviewed language revision");
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await expect(page.getByRole("button", { name: /^Reviewed language revision/u })).toBeVisible();
	await page.keyboard.press("Escape");
	await page.getByLabel("Full name", { exact: true }).fill("Latest synthetic language name");
	await expect
		.poll(async () => (await api.resume.getById({ id: copy.resumeId })).data.basics.name)
		.toBe("Latest synthetic language name");
	await page.reload();
	await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Latest synthetic language name");
	await page.getByRole("button", { name: "History", exact: true }).click();
	await page.getByRole("button", { name: /^Reviewed language revision/u }).click();
	await page.getByRole("button", { name: "Restore this version", exact: true }).click();
	await expect
		.poll(async () => (await api.resume.getById({ id: copy.resumeId })).data.basics.name)
		.toBe("Earlier synthetic language name");
	await page.keyboard.press("Escape");
	await page.reload();
	await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Earlier synthetic language name");
	expect((await api.resume.getById({ id })).data).toEqual(source.data);
});
