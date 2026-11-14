import { basename } from "node:path";

/** Test entry points must reject credentials before loading app configuration or fixtures. */
export function assertNoAiCredentials(environment = process.env) {
	for (const name of [
		"OPENROUTER_API_KEY",
		"OPENROUTER_BENCHMARK_KEY",
		"OPENAI_API_KEY",
		"AZURE_OPENAI_API_KEY",
		"AZURE_OPENAI_KEY",
		"TOGETHER_API_KEY",
		"ANTHROPIC_API_KEY",
		"GOOGLE_GENERATIVE_AI_API_KEY",
		"DEEPSEEK_API_KEY",
	]) {
		if (Object.hasOwn(environment, name)) throw new Error(`TEST_AI_CREDENTIAL_FORBIDDEN: ${name}`);
	}
}

if (
	process.env.VITEST ||
	process.env.NODE_ENV === "test" ||
	(process.argv[1] && basename(process.argv[1]) === "test-ai-guard.mjs")
)
	assertNoAiCredentials();
if (process.env.VITEST || process.env.NODE_ENV === "test") installTestNetworkGuard();

/** Vite reads dotenv files before setupFiles. Disable that read at config time. */
export function testViteEnvironment(directory, environment = process.env, mode = undefined) {
	if (
		mode === "test" ||
		environment.VITEST ||
		environment.NODE_ENV === "test" ||
		environment.TEST_INFERENCE_ISOLATION === "true"
	) {
		assertNoAiCredentials(environment);
		installTestNetworkGuard();
		return false;
	}
	return directory;
}

/** Injected fake transports remain usable; the real fetch can never reach OpenRouter in tests. */
export function installTestNetworkGuard() {
	assertNoAiCredentials();
	// Server configuration also uses Node's native loader, independently of Vite.
	// Tests use explicit fixtures and setup defaults; disable this loader before app imports.
	process.loadEnvFile = () => {};
	const original = globalThis.fetch;
	globalThis.fetch = (input, init) => {
		const url = new URL(input instanceof Request ? input.url : String(input), "http://test.invalid");
		if (url.hostname === "openrouter.ai" || url.hostname.endsWith(".openrouter.ai"))
			throw new Error("TEST_OPENROUTER_NETWORK_FORBIDDEN");
		if (
			[
				"api.openai.com",
				"api.together.xyz",
				"together.ai",
				"api.anthropic.com",
				"generativelanguage.googleapis.com",
				"api.deepseek.com",
			].includes(url.hostname) ||
			url.hostname.endsWith(".openai.azure.com") ||
			url.hostname.endsWith(".together.ai")
		)
			throw new Error("TEST_EXTERNAL_NETWORK_FORBIDDEN");
		return original(input, init);
	};
}
