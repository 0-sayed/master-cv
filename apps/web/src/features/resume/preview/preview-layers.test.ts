import { expect, it } from "vite-plus/test";
import { queuePreviewLayer } from "./preview-layers";

type Layer = { phase: "active" | "staged"; renderKey: string; acknowledgment: string };

it("retains the acknowledged canvas and its edit feedback on an identical save echo", () => {
	const acknowledged: Layer = { phase: "active", renderKey: "revision-a", acknowledgment: "header" };
	const echo: Layer = { ...acknowledged, phase: "staged", acknowledgment: "" };
	const next = queuePreviewLayer([acknowledged], echo);
	expect(next).toEqual([acknowledged]);
	expect(next[0]).toBe(acknowledged);
});
it("cancels an obsolete staged render when the latest edit returns to the active snapshot", () => {
	const active = { phase: "active" as const, renderKey: "a" };
	const pending = { phase: "staged" as const, renderKey: "b" };
	expect(queuePreviewLayer([active, pending], { ...active, phase: "staged" })).toEqual([active]);
});
it("stages only the latest distinct snapshot beside the active canvas", () => {
	const active = { phase: "active" as const, renderKey: "a" };
	const obsolete = { phase: "staged" as const, renderKey: "b" };
	const next = { phase: "staged" as const, renderKey: "c" };
	expect(queuePreviewLayer([], next)).toEqual([next]);
	expect(queuePreviewLayer([active, obsolete], next)).toEqual([active, next]);
});
