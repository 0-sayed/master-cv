import type { RouterClient } from "@orpc/server";
import type { Page, TestInfo } from "@playwright/test";
import type router from "@reactive-resume/api/routers";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { expect } from "@playwright/test";
import { educationItemSchema, projectItemSchema } from "@reactive-resume/schema/resume/data";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { seedReview } from "./reviewable-ai";

export async function seedVariantReview(page: Page, info: TestInfo, officialTerm = false) {
	const id = await seedReview(page, info);
	const api = variantClient(page);
	const current = await api.resume.getById({ id });
	const data = structuredClone(defaultResumeData);
	data.basics.name = "Synthetic Person";
	data.basics.headline = "Engineer";
	data.summary.hidden = false;
	data.summary.content = "<p>Built TypeScript services. Did not manage a budget.</p>";
	data.metadata.page.locale = "en-US";
	data.metadata.layout.pages = [{ fullWidth: false, main: ["summary"], sidebar: [] }];
	if (officialTerm) {
		data.sections.education.hidden = false;
		data.sections.education.items = [
			educationItemSchema.parse({
				id: "school",
				hidden: false,
				school: "Synthetic Institute",
				degree: "Training certificate",
				area: "",
				grade: "",
				location: "",
				period: "1445 AH",
				website: { url: "", label: "" },
				description: "",
			}),
		];
		data.metadata.layout.pages[0]?.main.push("education");
	}
	const response = await page.request.put(`/api/openapi/resumes/${id}`, {
		data: { data, expectedUpdatedAt: current.updatedAt.toISOString() },
	});
	await expect(response).toBeOK();
	return id;
}
export function variantClient(page: Page): RouterClient<typeof router> {
	return createORPCClient(
		new RPCLink({
			url: new URL("/api/rpc", page.url()).href,
			fetch: async (request, init) => {
				const actual = new Request(request, init);
				const response = await page.request.fetch(actual.url, {
					method: actual.method,
					headers: Object.fromEntries(actual.headers),
					...(actual.method !== "GET" && actual.method !== "HEAD" ? { data: await actual.text() } : {}),
				});
				return new Response(await response.body(), { status: response.status(), headers: response.headers() });
			},
		}),
	);
}
export async function startVariantReview(
	page: Page,
	prepared: { kind: string; sources: unknown[]; parameters: Record<string, unknown> },
) {
	const notice = (await (await page.request.get("/api/openapi/ai/processing-notices")).json())[0];
	await expect(
		await page.request.post("/api/openapi/ai/processing-consent", {
			data: { route: notice.route, noticeVersion: notice.noticeVersion, purpose: prepared.kind },
		}),
	).toBeOK();
	const response = await page.request.post("/api/openapi/ai/operations", {
		data: {
			kind: prepared.kind,
			sources: prepared.sources,
			parameters: prepared.parameters,
			requestKey: crypto.randomUUID(),
			route: notice.route,
			consentVersion: notice.noticeVersion,
		},
	});
	await expect(response).toBeOK();
	const operation = await response.json();
	await expect
		.poll(async () => (await (await page.request.get(`/api/openapi/ai/operations/${operation.id}`)).json()).state, {
			timeout: 30000,
		})
		.toBe("waiting_review");
	return operation.id as string;
}

/** Three independently reviewable passages, all synthetic and intentionally free of personal data. */
export async function seedTailoringReview(page: Page, info: TestInfo, jobText = "TypeScript services required.") {
	const sourceId = await seedVariantReview(page, info);
	const api = variantClient(page);
	const source = await api.resume.getById({ id: sourceId });
	const data = structuredClone(source.data);
	data.sections.projects.hidden = false;
	data.sections.projects.items = ["dashboard", "pipeline"].map((id) =>
		projectItemSchema.parse({
			id,
			hidden: false,
			name: `Synthetic ${id}`,
			period: "",
			website: { url: "", label: "" },
			description: id === "dashboard" ? "<p>Built TypeScript dashboards.</p>" : "<p>Built TypeScript pipelines.</p>",
		}),
	);
	data.metadata.layout.pages[0]?.main.push("projects");
	await expect(
		await page.request.put(`/api/openapi/resumes/${sourceId}`, {
			data: { data, expectedUpdatedAt: source.updatedAt.toISOString() },
		}),
	).toBeOK();
	const original = await api.resume.getById({ id: sourceId });
	const job = await api.career.jobTargets.save({ role: "Synthetic engineer", employer: "", text: jobText });
	const copy = await api.resume.variants.create({
		sourceResumeId: sourceId,
		expectedUpdatedAt: original.updatedAt.toISOString(),
		variantKind: "job",
		jobId: job.jobId,
		jobRevision: job.revision,
		requestKey: crypto.randomUUID(),
	});
	return { sourceId, copyId: copy.resumeId, original };
}

export async function launchTailoringReview(page: Page, copyId: string) {
	await page.goto(`/dashboard/resumes/${copyId}/job`);
	await page.getByRole("button", { name: /^(Review tailored wording|مراجعة الصياغة المخصصة)$/u }).click();
	await page
		.getByRole("dialog")
		.getByRole("button", { name: /^(Start review|بدء المراجعة)$/u })
		.click();
	await expect(page.getByRole("dialog")).toHaveCount(0);
}
