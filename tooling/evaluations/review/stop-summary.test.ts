import { expect, it } from "vite-plus/test";
import { rateLimitSummary } from "./stop-summary";

it("prints one line with completed/pending sessions, both ledgers and an exact quoted resume command", () => {
	const line = rateLimitSummary(
		{
			calls: [{ outcome: "valid" }, { outcome: "transient" }],
			incomplete: [{}, {}, {}],
			reservedUsd: 1.25,
			reservedOpenaiUsd: 2.5,
		},
		"/tmp/run's folder",
		["--stage", "full", "--budget-usd", "12", "--resume", "old", "-o", "/tmp/output"],
		"/repo/tooling",
	);
	expect(line).toContain("sessions done=1 pending=3");
	expect(line).toContain("OpenRouter=$1.250000 OpenAI=$2.500000");
	expect(line).toContain("'--resume' '/tmp/run'\\''s folder'");
	expect(line).not.toContain("'old'");
	expect(line.split("\n")).toHaveLength(1);
});
