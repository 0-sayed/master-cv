import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const serverRequire = createRequire(new URL("../../server/package.json", import.meta.url));
const { transformSync } = createRequire(serverRequire.resolve("tsx"))("esbuild");
const Redirect = Symbol("Redirect");
const deps = {
	"expo-router": { Redirect },
	"@/routes": { routes: { documents: () => "/documents" } },
	"@/features/ats-checker/checker": { AtsChecker: () => ({ type: "standalone-checker" }) },
};
const module = { exports: {} };
const code = transformSync(readFileSync(new URL("../app/ats-checker.tsx", import.meta.url), "utf8"), {
	loader: "tsx",
	format: "cjs",
	jsx: "transform",
}).code;
new Function("React", "require", "module", "exports", code)(
	{ createElement: (type, props) => ({ type, props }) },
	(name) => {
		assert.ok(name in deps, `Missing boundary: ${name}`);
		return deps[name];
	},
	module,
	module.exports,
);
const result = module.exports.default();
assert.equal(result.type, Redirect, "the legacy route must not mount the incompatible standalone uploader");
assert.equal(result.props.href, "/documents");
