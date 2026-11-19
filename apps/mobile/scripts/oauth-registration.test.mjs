import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const serverRequire = createRequire(new URL("../../server/package.json", import.meta.url));
const { transformSync } = createRequire(serverRequire.resolve("tsx"))("esbuild");
test("registrations belong to both the server and callback URL", async () => {
	const stored = new Map();
	const module = { exports: {} };
	let registrations = 0;
	const code = transformSync(readFileSync(new URL("../src/auth/oauth.ts", import.meta.url), "utf8"), {
		loader: "ts",
		format: "cjs",
	}).code;
	new Function("require", "module", "exports", "__DEV__", "fetch", code)(
		(name) => {
			if (name === "expo-secure-store")
				return {
					getItemAsync: async (key) => stored.get(key) ?? null,
					setItemAsync: async (key, value) => stored.set(key, value),
					deleteItemAsync: async (key) => stored.delete(key),
				};
			if (name === "react-native") return { Platform: { OS: "ios" } };
			throw new Error(`Unexpected module: ${name}`);
		},
		module,
		module.exports,
		false,
		async (_url, init) => {
			registrations++;
			assert.deepEqual(JSON.parse(init.body).redirect_uris, ["https://sirawise.io/auth/native-callback"]);
			return { ok: true, json: async () => ({ client_id: "new-client" }) };
		},
	);
	const oauth = module.exports;
	const origin = "https://self-hosted.test";
	stored.set(oauth.storeKey("client", origin), "old-callback-client");
	const discovery = { registrationEndpoint: `${origin}/register` };
	assert.equal(await oauth.registerClient(origin, discovery), "new-client");
	assert.equal(await oauth.registerClient(origin, discovery), "new-client");
	assert.equal(registrations, 1);
	await oauth.forgetClient(origin);
	assert.equal(await oauth.getClientId(origin), null);
});
