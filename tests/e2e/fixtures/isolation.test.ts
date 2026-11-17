import { strict as assert } from "node:assert";
import { test } from "node:test";
import { assertSyntheticSession } from "./isolation.ts";

test("fixture guard rejects owner, demo, missing, and mismatched sessions", () => {
	for (const user of [
		undefined,
		{ email: "demo@master-cv.test", username: "demo" },
		{ email: "owner@example.test", username: "owner" },
		{ email: "demo@master-cv.test", username: "e2e_fake" },
	])
		assert.throws(() => assertSyntheticSession({ user }), /disposable account/);
	assert.throws(() =>
		assertSyntheticSession({ user: { email: "e2e_one@example.test", username: "e2e_one" } }, "e2e_two@example.test"),
	);
});

test("fixture guard accepts only the generated account", () => {
	assert.doesNotThrow(() =>
		assertSyntheticSession({ user: { email: "e2e_one@example.test", username: "e2e_one" } }, "e2e_one@example.test"),
	);
});
