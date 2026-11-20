import { describe, expect, it } from "vite-plus/test";
import { assertProductionDemoEnvironment } from "./demo-production-safety";

const environment = {
	PERSONAL_CAREER_TOOLS_RELEASE_APPROVED: "true",
	NODE_ENV: "production",
	DATABASE_URL: "postgresql://runtime:secret@postgres:5432/sirawise",
	APP_URL: "https://sirawise.io",
	STORAGE_BACKEND: "local",
	DEMO_ACCOUNT_EMAIL: "boss-demo@example.test",
	DEMO_ACCOUNT_PASSWORD: "Private-demo-password-2026!",
	DEMO_PRODUCTION_CONFIRM: "boss-demo@example.test",
	ADMIN_EMAILS: "owner@example.test,boss-demo@example.test",
	OPENROUTER_API_KEY: "production-key-must-not-be-used",
};
describe("production demo authorization", () => {
	it.each([15, 16])("enforces the private password boundary at %i characters", (length) => {
		const run = () => assertProductionDemoEnvironment({ ...environment, DEMO_ACCOUNT_PASSWORD: "A".repeat(length) });
		if (length < 16) expect(run).toThrow("DEMO_PRIVATE_PASSWORD_REQUIRED");
		else expect(run().password).toHaveLength(16);
	});
	it("permits Compose and provider credentials with explicit dedicated credentials", () => {
		expect(assertProductionDemoEnvironment(environment)).toMatchObject({
			email: environment.DEMO_ACCOUNT_EMAIL,
			password: environment.DEMO_ACCOUNT_PASSWORD,
			appUrl: environment.APP_URL,
		});
	});
	it.each(["DEMO_ACCOUNT_EMAIL", "DEMO_ACCOUNT_PASSWORD", "DEMO_PRODUCTION_CONFIRM", "DATABASE_URL", "APP_URL"])(
		"refuses absent %s",
		(key) => {
			expect(() => assertProductionDemoEnvironment({ ...environment, [key]: undefined })).toThrow(/^DEMO_/);
		},
	);
	it.each(["", "short", "                ", "SirawiseDemo-Local-2026!", " SirawiseDemo-Local-2026! "])(
		"rejects unsafe passwords",
		(password) => {
			expect(() => assertProductionDemoEnvironment({ ...environment, DEMO_ACCOUNT_PASSWORD: password })).toThrow(
				"DEMO_PRIVATE_PASSWORD_REQUIRED",
			);
		},
	);
	it.each([
		{ PERSONAL_CAREER_TOOLS_RELEASE_APPROVED: undefined },
		{ PERSONAL_CAREER_TOOLS_RELEASE_APPROVED: "false" },
		{ NODE_ENV: "test" },
		{ DEMO_PRODUCTION_CONFIRM: "another@example.test" },
		{ DEMO_ACCOUNT_EMAIL: "not-an-email" },
		{ DEMO_ACCOUNT_EMAIL: "demo@sirawise.test", DEMO_PRODUCTION_CONFIRM: "demo@sirawise.test" },
		{ ADMIN_EMAILS: "owner@example.test" },
		{ DATABASE_URL: "postgresql://runtime:secret@remote.example.test/live" },
		{ DATABASE_URL: "postgresql://runtime:secret@postgres/live?host=remote.example.test" },
		{ DATABASE_URL: "postgresql://runtime:secret@postgres/live?options=unsafe" },
		{ DATABASE_URL: "postgresql://runtime:secret@postgres/live#override" },
		{ APP_URL: "https://user:password@sirawise.io" },
		{ APP_URL: "https://sirawise.io/path" },
		{ APP_URL: "https://sirawise.io?override=true" },
		{ STORAGE_BACKEND: "s3" },
	])("rejects unsafe authorization or destinations %j", (patch) => {
		expect(() => assertProductionDemoEnvironment({ ...environment, ...patch })).toThrow(/^DEMO_/);
	});
});
