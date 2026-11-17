import { expect, it, vi } from "vite-plus/test";
const files = vi.hoisted(() => ({ appendFileSync: vi.fn(), writeFileSync: vi.fn(), existsSync: vi.fn() }));
vi.mock("node:fs", async (original) => ({ ...(await original()), ...files }));
import { provisionRuntimeRole, writeRuntimeConfiguration, assertGitHubContext } from "./database-roles.mjs";

it("rejects GitHub export without both CI identity and an output file", () => {
	expect(() => assertGitHubContext({ GITHUB_ENV: "output" })).toThrow("GitHub Actions required");
	expect(() => assertGitHubContext({ GITHUB_ACTIONS: "true" })).toThrow("GITHUB_ENV is required");
	expect(() => assertGitHubContext({ GITHUB_ACTIONS: "true", GITHUB_ENV: "output" })).not.toThrow();
});

it("exports a restricted GitHub runtime URL without reading or writing environment files", () => {
	files.existsSync.mockImplementation(() => {
		throw new Error("Environment-file access forbidden");
	});
	writeRuntimeConfiguration({
		runtimeUrl: "postgresql://restricted:synthetic@localhost/test",
		migrationUrl: "postgresql://fixture:synthetic@localhost/test",
		githubEnv: "github-output",
	});
	expect(files.appendFileSync).toHaveBeenCalledWith(
		"github-output",
		"DATABASE_URL=postgresql://restricted:synthetic@localhost/test\n",
	);
	expect(files.existsSync).not.toHaveBeenCalled();
	expect(files.writeFileSync).not.toHaveBeenCalled();
});

it.each([
	"postgresql://fixture:fixture@localhost/fixture?host=remote.invalid",
	"postgresql://fixture:fixture@localhost/fixture?host=%2Ftmp",
	"postgresql://fixture:fixture@localhost/fixture?host=localhost&host=remote.invalid",
	"postgresql://fixture:fixture@localhost/fixture?%68ost=remote.invalid",
])("rejects pg host overrides before opening a connection: %s", async (url) => {
	await expect(provisionRuntimeRole(url)).rejects.toThrow("Local database required");
});
