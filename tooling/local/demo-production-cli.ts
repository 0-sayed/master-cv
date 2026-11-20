import { assertProductionDemoEnvironment } from "./demo-production-safety";

// Must precede every env-dependent application import. Compose supplies the server environment.
process.loadEnvFile = () => {};
try {
	if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("DEMO_NODE_24_REQUIRED");
	if (process.argv.length > 2) throw new Error("DEMO_UNKNOWN_ARGUMENT");
	assertProductionDemoEnvironment(process.env);
	// Fixtures need PostgreSQL and local storage only. No HTTP transport can reach an AI provider.
	globalThis.fetch = () => Promise.reject(new Error("DEMO_HTTP_FORBIDDEN"));
	const { seedProductionDemoWorkspace } = await import("./demo-production");
	const result = await seedProductionDemoWorkspace();
	console.info(
		`Demo ${result.status}: ${result.resumes} CVs, ${result.letters} letters, ${result.applications} applications, ${result.trash} trashed.`,
	);
} catch (error) {
	console.error(error instanceof Error && /^DEMO_[A-Z0-9_]+$/.test(error.message) ? error.message : "DEMO_SEED_FAILED");
	process.exitCode = 1;
} finally {
	await globalThis.__pool?.end();
}
