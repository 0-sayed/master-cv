import { expect, it } from "vite-plus/test";
import { diagnostic, registerDiagnosticSecrets } from "./diagnostics";

it("redacts known credentials in causes, code, and stack locations", () => {
	registerDiagnosticSecrets({ OPENROUTER_BENCHMARK_KEY: "PRIVATE_BENCHMARK_TOKEN", OTHER_API_KEY: "url+secret" });
	const error = new Error("PRIVATE_BENCHMARK_TOKEN", {
		cause: new Error(
			"Bearer unknown-secret https://user:password@example.com/catalog?api_key=encoded-secret API_KEY=another-secret url%2Bsecret\nnew line",
		),
	});
	error.stack = "Error: PRIVATE_BENCHMARK_TOKEN\n at main (/project/PRIVATE_BENCHMARK_TOKEN/cli.ts:27:8)";
	const report = diagnostic(error);
	expect(report.code).toBe("BENCHMARK_CONFIGURATION_OR_IO_ERROR");
	expect(report.message).toContain("https://example.com/catalog");
	expect(report.stackTop).toContain("cli.ts:27");
	for (const secret of [
		"PRIVATE_BENCHMARK_TOKEN",
		"unknown-secret",
		"password",
		"encoded-secret",
		"another-secret",
		"url%2Bsecret",
	])
		expect(JSON.stringify(report)).not.toContain(secret);
	expect(report.message).not.toMatch(/[\r\n]/u);
});
it("retains a sanitized string exception and bounds cyclic cause messages", () => {
	expect(diagnostic("failed Bearer unsafe-token").message).toBe("failed Bearer [REDACTED]");
	const error = new Error("CIRCULAR");
	error.cause = error;
	expect(diagnostic(error).message).toBe("CIRCULAR");
	expect(diagnostic(new Error("x".repeat(10000))).message.length).toBeLessThanOrEqual(600);
});
