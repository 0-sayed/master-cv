import type { AttemptRecord, BenchmarkCall, RawRecord } from "./runner";
import { open, readFile } from "node:fs/promises";
import { z } from "zod";
import { validateSettlement, type BillingSettlement } from "./reconcile";
type Reservation = {
	key: string;
	reservedMicros: number;
	reservedOpenRouterMicros?: number;
	reservedOpenaiMicros?: number;
};
type Event =
	| { type: "reserved"; data: Reservation }
	| { type: "raw"; data: RawRecord }
	| { type: "attempt"; data: AttemptRecord }
	| { type: "scored"; data: BenchmarkCall }
	| { type: "settled"; data: BillingSettlement };
const writes = new Map<string, Promise<void>>();
export async function appendEvent(path: string, event: Event) {
	const prior = writes.get(path) ?? Promise.resolve();
	const next = prior.then(() => writeEvent(path, event));
	writes.set(path, next);
	try {
		await next;
	} finally {
		if (writes.get(path) === next) writes.delete(path);
	}
}
async function writeEvent(path: string, event: Event) {
	const file = await open(path, "a");
	try {
		await file.writeFile(`${JSON.stringify(event)}\n`);
		await file.sync();
	} finally {
		await file.close();
	}
}
export async function readJournal(path: string) {
	const history = {
		pendingReservations: [] as Reservation[],
		billingSettlements: [] as BillingSettlement[],
		rawRecords: [] as RawRecord[],
		attempts: [] as AttemptRecord[],
		previousCalls: [] as BenchmarkCall[],
		unsettledRetryReservations: [] as Reservation[],
	};
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch (e) {
		if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") return history;
		throw e;
	}
	if (text && !text.endsWith("\n")) throw new Error("JOURNAL_INCOMPLETE");
	const scored = new Set<string>();
	const unsettled = new Map<string, Reservation>();
	for (const line of text.split("\n").filter(Boolean)) {
		let event: Event;
		try {
			event = JSON.parse(line) as Event;
			z.object({
				type: z.enum(["reserved", "raw", "scored", "attempt", "settled"]),
				data: z
					.object({
						key: z.string(),
						reservedMicros: z.number().int().nonnegative(),
						reservedOpenRouterMicros: z.number().int().nonnegative().optional(),
						reservedOpenaiMicros: z.number().int().nonnegative().optional(),
					})
					.passthrough(),
			}).parse(event);
		} catch {
			throw new Error("JOURNAL_INVALID");
		}
		if (event.type === "reserved") {
			history.pendingReservations.push(event.data);
			if (event.data.reservedMicros > 0 && scored.has(event.data.key)) unsettled.set(event.data.key, event.data);
		} else if (event.type === "settled")
			history.billingSettlements.push(validateSettlement(event.data, event.data.journalSha256, [event.data.key]));
		else if (event.type === "raw") history.rawRecords.push(event.data);
		else if (event.type === "attempt") history.attempts.push(event.data);
		else {
			history.previousCalls.push(event.data);
			scored.add(event.data.key);
			unsettled.delete(event.data.key);
		}
	}
	history.unsettledRetryReservations = [...unsettled.values()];
	return history;
}
