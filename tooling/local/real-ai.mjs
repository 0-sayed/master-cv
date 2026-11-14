import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

// Load before importing any app modules; an explicit override permits fake-key verification
// without opening the owner's credential file.
if (process.env.NODE_ENV === "production") throw new Error("LOCAL_REAL_AI_DEV_ONLY");
const { values } = parseArgs({ options: { "env-file": { type: "string" } } });
if (existsSync(".env.runtime.local")) process.loadEnvFile(resolve(".env.runtime.local"));
process.loadEnvFile(resolve(".env.local"));
process.loadEnvFile(resolve(values["env-file"] ?? ".env.openrouter.local"));
if (process.env.NODE_ENV === "production") throw new Error("LOCAL_REAL_AI_DEV_ONLY");
if (!process.env.OPENROUTER_API_KEY?.trim()) throw new Error("OPENROUTER_API_KEY_REQUIRED");
process.env.NODE_ENV = "development";
process.env.PORT = "3060";
process.env.APP_URL = "http://localhost:3060";
// Source-consumed workspace modules use tsx, already installed by the server.
const { register } = createRequire(new URL("../../apps/server/package.json", import.meta.url))("tsx/esm/api");
register({ tsconfig: resolve("tsconfig.json") });
// @boundaries-ignore Dev-only composition entry lives outside production workspace packages.
await import("../../tests/e2e/dev-real-ai-server.ts");
