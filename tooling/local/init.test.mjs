import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { afterEach, expect, it } from "vite-plus/test";
import { initLocal } from "./init.mjs";

const roots = [];
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "master-cv-env-"));
	roots.push(root);
	return root;
}
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

it("uses WTC allocated ports for host URLs and keeps state inside this checkout", () => {
	const root = fixture();
	writeFileSync(
		join(root, ".env"),
		"PORT=23100\nSERVER_PORT=23101\nEMAIL_PORT=23102\nPOSTGRES_PORT=25532\nPOSTGRES_PASSWORD=fixture-password\n",
	);
	initLocal(root);
	const env = parseEnv(readFileSync(join(root, ".env.local"), "utf8"));
	expect(env.APP_URL).toBe("http://localhost:23100");
	expect(env.DATABASE_URL).toBe("postgresql://master_cv:fixture-password@127.0.0.1:25532/master_cv");
	expect(env.DATABASE_MIGRATION_URL).toBe(env.DATABASE_URL);
	expect(env.LOCAL_STORAGE_PATH).toBe(join(root, "data"));
	expect(env.EMAIL_PORT).toBe("23102");
	expect(statSync(join(root, ".env.local")).mode & 0o777).toBe(0o600);
});

it("keeps generated credentials stable on restart and different between worktrees", () => {
	const first = fixture();
	const second = fixture();
	initLocal(first);
	const before = readFileSync(join(first, ".env.local"), "utf8");
	initLocal(first);
	const a = parseEnv(readFileSync(join(first, ".env.local"), "utf8"));
	initLocal(second);
	const b = parseEnv(readFileSync(join(second, ".env.local"), "utf8"));
	expect(readFileSync(join(first, ".env.local"), "utf8")).toBe(before);
	expect(a.AUTH_SECRET).toMatch(/^[a-f0-9]{64}$/);
	expect(a.AUTH_SECRET).not.toBe(b.AUTH_SECRET);
	expect(a.ENCRYPTION_SECRET).not.toBe(b.ENCRYPTION_SECRET);
});

it("preserves hand-written configuration and rejects colliding ports", () => {
	const root = fixture();
	writeFileSync(join(root, ".env.local"), "# hand written\nAUTH_SECRET=keep-me\n");
	expect(() => initLocal(root)).toThrow(/existing.*env.local/);
	expect(readFileSync(join(root, ".env.local"), "utf8")).toContain("keep-me");
	const invalid = fixture();
	writeFileSync(join(invalid, ".env"), "PORT=23100\nSERVER_PORT=23100\n");
	expect(() => initLocal(invalid)).toThrow(/distinct/);
});

it("retains deliberate app settings when WTC refreshes the allocated ports", () => {
	const root = fixture();
	initLocal(root);
	const appPath = join(root, ".env.local");
	writeFileSync(
		appPath,
		readFileSync(appPath, "utf8") +
			"SMTP_HOST=mail.fixture.invalid\nREDIS_URL=redis://127.0.0.1:26000\nSTORAGE_BACKEND=s3\nS3_BUCKET=fixture-bucket\n",
	);
	writeFileSync(
		join(root, ".env"),
		readFileSync(join(root, ".env"), "utf8") + "PORT=23100\nSERVER_PORT=23101\nEMAIL_PORT=23102\nPOSTGRES_PORT=25532\n",
	);
	const app = initLocal(root);
	expect(app.APP_URL).toBe("http://localhost:23100");
	expect(parseEnv(readFileSync(appPath, "utf8"))).toMatchObject({
		SMTP_HOST: "mail.fixture.invalid",
		REDIS_URL: "redis://127.0.0.1:26000",
		STORAGE_BACKEND: "s3",
		S3_BUCKET: "fixture-bucket",
	});
});

it("rejects ports that differ only by leading zeroes", () => {
	const root = fixture();
	writeFileSync(join(root, ".env"), "PORT=03000\nSERVER_PORT=3000\nPOSTGRES_PASSWORD=fixture-password\n");
	expect(() => initLocal(root)).toThrow(/distinct/);
});

it.each([
	'quoted "fixture"',
	"C:\\fixture\\new\\resume",
	"a value with 'single' and \"double\" quotes",
	"first line\nsecond line # preserved",
	"all three: ' \" `",
])("preserves a custom setting across repeated restarts: %s", (value) => {
	const root = fixture();
	initLocal(root);
	const appPath = join(root, ".env.local");
	const quoted = !value.includes("'") ? `'${value}'` : !value.includes("`") ? `\`${value}\`` : value;
	writeFileSync(appPath, readFileSync(appPath, "utf8") + `CUSTOM_SETTING=${quoted}\n`);
	expect(parseEnv(readFileSync(appPath, "utf8")).CUSTOM_SETTING).toBe(value);
	initLocal(root);
	initLocal(root);
	expect(parseEnv(readFileSync(appPath, "utf8")).CUSTOM_SETTING).toBe(value);
});
