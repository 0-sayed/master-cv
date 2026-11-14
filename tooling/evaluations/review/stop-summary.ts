/** Shell-quote the original CLI arguments; never reconstruct credentials or silently change run identity. */
export function rateLimitSummary(
	artifact: {
		calls: { outcome: string }[];
		incomplete?: unknown[];
		reservedUsd: number;
		reservedOpenaiUsd?: number;
	},
	folder: string,
	args: string[],
	cwd: string,
) {
	const quote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;
	const original = args.filter(
		(arg, index) => arg !== "--resume" && args[index - 1] !== "--resume" && !arg.startsWith("--resume="),
	);
	const command = ["pnpm", "--dir", cwd, "exec", "tsx", "evaluations/review/cli.ts", ...original, "--resume", folder]
		.map(quote)
		.join(" ");
	return `PROVIDER_RATE_LIMITED sessions done=${artifact.calls.filter((c) => c.outcome !== "transient").length} pending=${artifact.incomplete?.length ?? 0} OpenRouter=$${artifact.reservedUsd.toFixed(6)} OpenAI=$${(artifact.reservedOpenaiUsd ?? 0).toFixed(6)} (includes unknown-charge holds); resume: ${command}`;
}
