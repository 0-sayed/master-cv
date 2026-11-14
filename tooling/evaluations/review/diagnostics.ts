import { relative, resolve } from "node:path";

const secrets = new Set<string>();
export function registerDiagnosticSecrets(values: Record<string, string | undefined>) {
	for (const [name, value] of Object.entries(values))
		if (value && /key|token|secret|password|credential/iu.test(name)) secrets.add(value);
}
function sanitize(input: string): string {
	let value = input;
	registerDiagnosticSecrets(process.env);
	for (const secret of [...secrets].sort((a, b) => b.length - a.length))
		value = value.replaceAll(secret, "[REDACTED]").replaceAll(encodeURIComponent(secret), "[REDACTED]");
	return value
		.replace(/https?:\/\/[^\s"'<>]+/giu, (raw) => {
			try {
				const url = new URL(raw);
				return `${url.origin}${url.pathname}`;
			} catch {
				return "[REDACTED_URL]";
			}
		})
		.replace(/\b(Bearer|Basic)\s+[^\s,;"']+/giu, "$1 [REDACTED]")
		.replace(/\b(?:sk-|sk_)[\w-]+/gu, "[REDACTED]")
		.replace(
			/\b([\w-]*(?:key|token|secret|password|credential)[\w-]*["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;}]+)/giu,
			"$1[REDACTED]",
		)
		.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, " ")
		.replace(/\s+/gu, " ")
		.trim()
		.slice(0, 600);
}
/** Preserve causal messages; never serialize Error data/request/response fields. */
export function diagnostic(error: unknown) {
	const messages: string[] = [];
	let current = error;
	const seen = new Set<unknown>();
	while (current instanceof Error && !seen.has(current) && messages.length < 4) {
		seen.add(current);
		messages.push(current.message);
		current = current.cause;
	}
	if (typeof current === "string") messages.push(current);
	const location =
		error instanceof Error
			? error.stack
					?.split("\n")
					.slice(1)
					.map((line) => line.match(/(?:\(|\s)((?:file:\/\/)?\/[^()]+):([0-9]+):[0-9]+\)?$/u))
					.find(Boolean)
			: undefined;
	const path = location?.[1]?.replace(/^file:\/\//u, "");
	return {
		code:
			error instanceof Error && /^[A-Z][A-Z_]+$/u.test(error.message) && sanitize(error.message) === error.message
				? error.message
				: "BENCHMARK_CONFIGURATION_OR_IO_ERROR",
		message: sanitize(messages.join(": ") || "Non-Error exception"),
		stackTop: path ? sanitize(`${relative(resolve(".."), path)}:${location?.[2]}`) : null,
	};
}
