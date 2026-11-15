import { expect, it } from "vite-plus/test";
import { eraseRecordedProcessors } from "./processor-deletion";

it("persists confirmed processor progress when another adapter throws and continues remaining erasures", async () => {
	const recorded = ["first", "offline", "last"].map((processor) => ({
		processor,
		subjectReference: processor,
		approved: true,
		confirmed: false,
	}));
	const adapters = recorded.map(({ processor }) => ({
		processor,
		erase: async () => {
			if (processor === "offline") throw new Error("private upstream response");
			return { state: "confirmed" as const };
		},
	}));
	await expect(eraseRecordedProcessors({ requestId: "request", recorded, adapters })).resolves.toBe("pending");
	expect(recorded.map((record) => record.confirmed)).toEqual([true, false, true]);
});
