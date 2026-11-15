import assert from "node:assert/strict";
import { test } from "vite-plus/test";
import { preparePrivacyTests, validatePrivacyTestUrls } from "./prepare-privacy-tests.mjs";
const urls = () =>
	Object.fromEntries(
		["COVER_LETTER_TEST_DATABASE_URL", "INTEGRATIONS_TEST_DATABASE_URL", "OAUTH_TEST_DATABASE_URL"].map((key) => [
			key,
			"postgresql://postgres:postgres@localhost:55432/postgres",
		]),
	);
test("requires all three explicit test URLs", () => {
	for (const key of Object.keys(urls())) {
		const input = urls();
		delete input[key];
		assert.throws(() => validatePrivacyTestUrls(input), /explicit/);
	}
});
test("rejects remote, alternate port, socket overrides and non-test credentials", () => {
	for (const url of [
		"postgresql://postgres:postgres@remote.test:55432/postgres",
		"postgresql://postgres:postgres@localhost:5432/postgres",
		"postgresql://postgres:postgres@localhost:55432/postgres?host=remote.test",
		"postgresql://real:secret@localhost:55432/postgres",
	]) {
		const input = urls();
		input.OAUTH_TEST_DATABASE_URL = url;
		assert.throws(() => validatePrivacyTestUrls(input), /designated/);
	}
});
test("readiness failure prevents migration and closes connection", async () => {
	let migrated = false;
	let closed = false;
	await assert.rejects(
		preparePrivacyTests(urls(), {
			connect: () => ({
				query: () => Promise.reject(new Error("unavailable")),
				end: async () => {
					closed = true;
				},
			}),
			migrate: async () => {
				migrated = true;
			},
		}),
		/unavailable/,
	);
	assert.equal(migrated, false);
	assert.equal(closed, true);
});
