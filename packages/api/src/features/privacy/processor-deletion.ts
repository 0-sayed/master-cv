import type { ProcessorDeletionAdapter } from "./contracts";
export type RecordedProcessor = { processor: string; subjectReference: string; approved: boolean; confirmed?: boolean };
/** Missing historical approval or adapter is pending; unapproved suppliers are never called. */
export async function eraseRecordedProcessors(input: {
	requestId: string;
	recorded: RecordedProcessor[];
	adapters: ProcessorDeletionAdapter[];
}) {
	let pending = false;
	for (const record of input.recorded) {
		if (record.confirmed) continue;
		const adapter = input.adapters.find((item) => item.processor === record.processor);
		if (!record.approved || !adapter) {
			pending = true;
			continue;
		}
		const result = await adapter
			.erase({
				requestId: input.requestId,
				processor: record.processor,
				subjectReference: record.subjectReference,
			})
			.catch(() => ({ state: "pending" as const }));
		if (result.state === "confirmed") record.confirmed = true;
		else pending = true;
	}
	return pending ? "pending" : input.recorded.length ? "confirmed" : "not_used";
}
