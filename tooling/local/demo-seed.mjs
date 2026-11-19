import { pathToFileURL } from "node:url";
import { assertNoAiCredentials, installTestNetworkGuard } from "./test-ai-guard.mjs";

export async function runDemoSeed() {
	try {
		if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("DEMO_NODE_24_REQUIRED");
		process.loadEnvFile = () => {};
		const { assertDemoEnvironment } = await import("./demo-safety.ts");
		await assertDemoEnvironment(process.env);
		assertNoAiCredentials();
		process.env.TEST_INFERENCE_ISOLATION = "true";
		installTestNetworkGuard();
		const { register } = await import("tsx/esm/api");
		register();
		const { seedDemoWorkspace, closeDemoDatabase } = await import("./demo-seed.ts");
		try {
			const args = process.argv.slice(2);
			if (args.some((arg) => arg !== "--reset") || args.length > 1) throw new Error("DEMO_UNKNOWN_ARGUMENT");
			const result = await seedDemoWorkspace({ reset: args.includes("--reset") });
			const { demoCredentials } = await import("./demo-fixture.ts");
			console.info(`Demo ${result.status}: ${demoCredentials.email} / ${demoCredentials.password}`);
			console.info(
				`Readback: ${result.resumes} CVs, ${result.letters} letters, ${result.applications} applications, ${result.trash} trashed.`,
			);
		} finally {
			await closeDemoDatabase();
		}
	} catch (error) {
		const code = error instanceof Error && /^DEMO_[A-Z0-9_]+$/.test(error.message) ? error.message : "DEMO_SEED_FAILED";
		console.error(code);
		process.exitCode = 1;
	}
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await runDemoSeed();
