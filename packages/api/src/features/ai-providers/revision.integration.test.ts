import { describe, expect, it, vi } from "vite-plus/test";
import { withDatabaseOwner } from "@reactive-resume/db/client";
import { aiTestDatabase } from "../ai/testing/database";

const connection = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("../ai/service", () => ({ testConnection: connection.run }));
vi.mock("@reactive-resume/env/server", async (original) => {
	const actual = await original<typeof import("@reactive-resume/env/server")>();
	return {
		...actual,
		env: { ...actual.env, AI_PROVIDER: undefined, ENCRYPTION_SECRET: "synthetic-revision-test-secret" },
	};
});
const { aiProvidersService } = await import("./service");
describe.skipIf(!process.env.COVER_LETTER_TEST_DATABASE_URL)("provider configuration revisions", () => {
	const database = aiTestDatabase();
	const run = <T>(work: () => T) => database.run(() => withDatabaseOwner("alice", work));
	it.each([true, false])("does not apply an old credential test (%s) to a replacement configuration", async (ok) => {
		const provider = await run(() =>
			aiProvidersService.create({
				userId: "alice",
				label: "Synthetic",
				provider: "openrouter",
				model: "old",
				apiKey: "synthetic-key",
			}),
		);
		let finish: (value: { ok: boolean; error?: string }) => void = () => {
			throw new Error("Test has not started");
		};
		let started: () => void = () => undefined;
		const ready = new Promise<void>((resolve) => {
			started = resolve;
		});
		connection.run.mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve;
					started();
				}),
		);
		const pending = run(() => aiProvidersService.test({ userId: "alice", id: provider.id }));
		await ready;
		await run(() => aiProvidersService.update({ userId: "alice", id: provider.id, model: "replacement" }));
		finish(ok ? { ok: true } : { ok: false, error: "Synthetic failure" });
		await expect(pending).rejects.toMatchObject({ code: "CONFLICT" });
		const current = (await run(() => aiProvidersService.list({ userId: "alice" })))[0];
		expect(current).toMatchObject({ model: "replacement", testStatus: "untested", enabled: false });
	});
});
