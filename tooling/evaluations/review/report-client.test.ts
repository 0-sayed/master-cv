import { afterEach, expect, it, vi } from "vite-plus/test";
import { Window } from "happy-dom";
import { loadModels } from "./config";
import { cases } from "./corpus";
import { identityMapping, renderReport } from "./report";
import { required } from "./required";
import { runBenchmark } from "./runner";

afterEach(() => vi.unstubAllGlobals());

it("blocks identity import until every original has two complete blind ratings", async () => {
	const artifact = await runBenchmark({
		models: loadModels().slice(0, 1),
		cases: cases.filter((c) => c.holdout).slice(0, 1),
		runs: 1,
		fake: true,
		budgetUsd: 10,
	});
	const privateData = identityMapping(artifact);
	const html = await renderReport(artifact, privateData);
	const window = new Window({ url: "http://localhost:3000" });
	vi.stubGlobal("document", window.document);
	vi.stubGlobal("localStorage", window.localStorage);
	document.write(html.replace(/<script>[^]*?<\/script>/gu, ""));
	await import("./report-client");
	const upload = required(document.querySelector<HTMLInputElement>("#upload"));
	const identities = required(document.querySelector<HTMLInputElement>("#identity-upload"));
	const scores = required(document.querySelector<HTMLElement>("#scorecard"));
	const ratings = privateData.groups
		.filter((g) => !g.repeat)
		.flatMap((g) =>
			g.outputs.flatMap((o) =>
				["one", "two"].map((reviewer) => ({
					outputId: o.id,
					reviewer,
					arabic: 5,
					fidelity: 5,
					naturalness: 5,
					notes: "",
					unsupportedFact: false,
				})),
			),
		);
	const file = (element: HTMLInputElement, data: unknown) =>
		Object.defineProperty(element, "files", {
			configurable: true,
			value: [{ text: async () => JSON.stringify(data) }],
		});
	file(upload, { reportId: privateData.reportId, ratings: ratings.slice(1) });
	await upload.onchange?.call(upload, new Event("change"));
	file(identities, privateData);
	await identities.onchange?.call(identities, new Event("change"));
	expect(scores.hidden).toBe(true);
	const click = vi.spyOn(identities, "click");
	required(document.querySelector<HTMLButtonElement>("#reveal")).click();
	expect(click).not.toHaveBeenCalled();
	file(upload, { reportId: privateData.reportId, ratings });
	await upload.onchange?.call(upload, new Event("change"));
	await identities.onchange?.call(identities, new Event("change"));
	expect(scores.hidden).toBe(false);
	expect(document.querySelector("#task-decisions")?.textContent).toContain("FAKE evidence never qualifies");
});
