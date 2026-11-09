import { expect, it } from "vite-plus/test";
import { provisionRuntimeRole } from "./database-roles.mjs";

it.each([
	"postgresql://fixture:fixture@localhost/fixture?host=remote.invalid",
	"postgresql://fixture:fixture@localhost/fixture?host=%2Ftmp",
	"postgresql://fixture:fixture@localhost/fixture?host=localhost&host=remote.invalid",
	"postgresql://fixture:fixture@localhost/fixture?%68ost=remote.invalid",
])("rejects pg host overrides before opening a connection: %s", async (url) => {
	await expect(provisionRuntimeRole(url)).rejects.toThrow("Local database required");
});
