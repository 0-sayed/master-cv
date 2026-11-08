import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

const source = readFileSync(new URL("../src/preview/resources.ts", import.meta.url), "utf8");
const code = stripTypeScriptTypes(source)
	.replace(
		/import \{([^}]+)\} from "([^"]+)";/g,
		(_match, names, id) => `const {${names.replace(/ as /g, ": ")}} = require("${id}");`,
	)
	.replace(/export /g, "");
const downloads = [];
const hashes = [];
let server = "https://first.example";
const bytes = new Uint8Array([0, 1, 0, 0, 1]);
const modules = {
	"expo-crypto": {
		CryptoDigestAlgorithm: { SHA256: "sha256" },
		digestStringAsync: async (_algorithm, input) => {
			hashes.push(input);
			return "hash";
		},
	},
	"expo-file-system": {
		Directory: class {
			create() {
				throw new Error("Disk offline");
			}
		},
		File: class {},
		Paths: { cache: "cache", document: "document" },
	},
	"expo/fetch": { fetch() {} },
	"@reactive-resume/pdf/native": {
		downloadFont: async (input) => {
			downloads.push(input);
			return bytes;
		},
	},
	"@/auth/session": { getServer: () => server },
};
const module = { exports: {} };
new Function("require", "module", "exports", code + "\nmodule.exports = { readCachedFont };")(
	(id) => {
		assert(id in modules, `Unexpected import ${id}`);
		return modules[id];
	},
	module,
	module.exports,
);
const path = "/fonts/noto-sans-arabic/2.009/NotoSansArabic-Regular.ttf";
assert.deepEqual(await module.exports.readCachedFont(path), bytes);
server = "https://second.example";
assert.deepEqual(await module.exports.readCachedFont(path), bytes);
assert.deepEqual(downloads, [`https://first.example${path}`, `https://second.example${path}`]);
assert.deepEqual(hashes, downloads, "Cache identities must include the selected installation");
console.log("PASS: cold native font download resolves the installation and keeps cache identities separate.");
