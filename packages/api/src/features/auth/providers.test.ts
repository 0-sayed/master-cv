import { expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
	select: vi.fn(),
	predicates: [] as unknown[],
	getLetter: vi.fn(),
	exportCareer: vi.fn(),
	env: { GOOGLE_CLIENT_ID: "configured", GOOGLE_CLIENT_SECRET: "configured" },
}));
vi.mock("@reactive-resume/db/client", () => ({ db: { select: mocks.select } }));
vi.mock("@reactive-resume/db/schema", () => ({
	user: { id: "user.id" },
	resume: { userId: "resume.userId" },
	coverLetter: { userId: "coverLetter.userId" },
	application: { userId: "application.userId" },
	aiContentReport: { userId: "aiContentReport.userId" },
}));
vi.mock("drizzle-orm", () => ({ eq: (column: unknown, value: unknown) => ({ column, value }) }));
vi.mock("@reactive-resume/env/server", () => ({
	env: mocks.env,
}));
vi.mock("@reactive-resume/auth/config", () => ({ isCustomOAuthProviderEnabled: () => false }));
vi.mock("../storage/service", () => ({ getStorageService: vi.fn() }));
vi.mock("../cover-letters/service", () => ({ coverLetterService: { getById: mocks.getLetter } }));
vi.mock("../career/service", () => ({ careerService: { exportData: mocks.exportCareer } }));
const { authService } = await import("./service");

it("lists Google only when both Google credentials are configured", () => {
	expect(authService.providers.list()).toEqual({ credential: "Password", passkey: "Passkey", google: "Google" });

	mocks.env.GOOGLE_CLIENT_SECRET = "";
	expect(authService.providers.list()).toEqual({ credential: "Password", passkey: "Passkey" });

	mocks.env.GOOGLE_CLIENT_SECRET = "configured";
	mocks.env.GOOGLE_CLIENT_ID = "";
	expect(authService.providers.list()).toEqual({ credential: "Password", passkey: "Passkey" });

	mocks.env.GOOGLE_CLIENT_ID = "configured";
	expect(authService.providers.list()).toEqual({ credential: "Password", passkey: "Passkey", google: "Google" });
});
