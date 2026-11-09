import { describe, expect, it, vi } from "vite-plus/test";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { createPublicResumePdf } from "./public-pdf";

// The default lookup runs its real query against a stand-in `pg` client that records the SQL and finds nothing.
const queries = vi.hoisted(() => [] as string[]);
vi.mock("../../context", () => ({ resolveAuthenticationFromRequestHeaders: async () => null }));
vi.mock("@reactive-resume/db/client", async () => {
	const { drizzle } = await import("drizzle-orm/node-postgres");
	const client = {
		query: ({ text }: { text: string }) => {
			queries.push(text);
			return Promise.resolve({ rows: [] });
		},
	};
	return {
		db: drizzle({ client: client as never }),
		withDatabaseOwner: (_userId: string, work: () => unknown) => work(),
	};
});

const requestHeaders = new Headers({ "x-forwarded-for": "203.0.113.7" });
const input = {
	username: "jane",
	slug: "resume",
	requestHeaders,
	trustedClient: "203.0.113.9",
};

const buildResume = (overrides: Partial<{ isPublic: boolean; passwordHash: string | null }> = {}) => ({
	id: "resume-1",
	userId: "owner-1",
	data: structuredClone(defaultResumeData),
	isPublic: overrides.isPublic ?? true,
	passwordHash: overrides.passwordHash ?? null,
});

const dependencies = (resume = buildResume()) => ({
	findResume: vi.fn().mockResolvedValue(resume),
	hasPasswordAccess: vi.fn().mockReturnValue(true),
	resolveCurrentUserId: vi.fn().mockResolvedValue(undefined),
	rateLimiter: { consume: vi.fn() },
	renderPdf: vi.fn().mockResolvedValue(new File(["%PDF"], "resume.pdf", { type: "application/pdf" })),
});

describe("createPublicResumePdf", () => {
	it("authorizes private and password-protected resumes before budget or render", async () => {
		const privateDependencies = dependencies(buildResume({ isPublic: false }));
		await expect(createPublicResumePdf(input, privateDependencies)).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(privateDependencies.rateLimiter.consume).not.toHaveBeenCalled();
		expect(privateDependencies.renderPdf).not.toHaveBeenCalled();

		const passwordDependencies = dependencies(buildResume({ passwordHash: "hash" }));
		passwordDependencies.hasPasswordAccess.mockReturnValue(false);
		await expect(createPublicResumePdf(input, passwordDependencies)).rejects.toMatchObject({ code: "NEED_PASSWORD" });
		expect(passwordDependencies.rateLimiter.consume).not.toHaveBeenCalled();
		expect(passwordDependencies.renderPdf).not.toHaveBeenCalled();
	});

	it("does not look in Trash, so a trashed resume's link stops serving its PDF", async () => {
		await expect(createPublicResumePdf(input)).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(queries.at(-1)).toContain('"resume"."trashed_at" is null');
	});

	it("lets the owner render a private password-protected CV without a visitor unlock cookie", async () => {
		const ownerDependencies = dependencies(buildResume({ isPublic: false, passwordHash: "hash" }));
		ownerDependencies.resolveCurrentUserId.mockResolvedValue("owner-1");
		ownerDependencies.hasPasswordAccess.mockReturnValue(false);
		const result = await createPublicResumePdf(input, ownerDependencies);
		expect(result.body.type).toBe("application/pdf");
	});

	it("renders on demand with canonical public stylesheet source", async () => {
		const resume = buildResume();
		resume.data.basics.name = "Ada Lovelace";
		resume.data.metadata.stylesheet = {
			mode: "semantic",
			source: { languageVersion: 1, text: "@version 1;\nname { color: blue; }\n" },
		};
		const pdfDependencies = dependencies(resume);

		const result = await createPublicResumePdf(input, pdfDependencies);

		expect(result.filename).toBe("ada-lovelace.pdf");
		expect(pdfDependencies.rateLimiter.consume).toHaveBeenCalledWith({
			trustedClient: input.trustedClient,
			resumeId: resume.id,
		});
		expect(pdfDependencies.renderPdf).toHaveBeenCalledWith({ data: resume.data, filename: "ada-lovelace.pdf" });
	});
});
