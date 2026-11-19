import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("uses the approved mobile name, permissions and store title", () => {
	const config = readFileSync(new URL("../app.config.ts", import.meta.url), "utf8");
	const metadata = JSON.parse(readFileSync(new URL("../store/metadata.json", import.meta.url), "utf8"));
	assert.match(config, /name: "Sirawise"/);
	assert.match(config, /const host = "sirawise.io"/);
	const oauth = readFileSync(new URL("./auth/oauth.ts", import.meta.url), "utf8");
	const session = readFileSync(new URL("./auth/session.ts", import.meta.url), "utf8");
	assert.match(oauth, /const appHost = "sirawise.io"/);
	assert.match(session, /DEFAULT_SERVER = "https:\/\/sirawise.io"/);
	for (const locale of Object.values(metadata.localizations) as Array<{ description: string }>) {
		assert.doesNotMatch(locale.description, /rxresu\.me/);
	}
	assert.match(config, /Sirawise records your answers/);
	assert.match(config, /Sirawise uses your photos/);
	assert.match(config, /Sirawise uses your camera/);
	assert.equal(metadata.name, "Sirawise");
	assert.match(metadata.localizations.en.description, /Sirawise/);
	assert.match(metadata.localizations.ar.description, /سيراوايز/);
});

test("keeps active auth and shell source labels on the current product", () => {
	for (const path of [
		"../app/(auth)/server.tsx",
		"../src/auth/auth-header.tsx",
		"../src/shell/app-tabs.tsx",
		"../app/(tabs)/settings/index.tsx",
	]) {
		assert.doesNotMatch(readFileSync(new URL(path, import.meta.url), "utf8"), /Reactive Resume|Master CV/);
	}
});
