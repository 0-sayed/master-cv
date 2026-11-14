import { z } from "zod";
import { withOpenRouterFee } from "./budget";
const payer = z.strictObject({
	openRouterBaseMicros: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
	openaiMicros: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
const receipt = z.strictObject({
	key: z.string().min(1),
	reservedMicros: z.literal(0),
	journalSha256: z.string().regex(/^[a-f0-9]{64}$/u),
	evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/u),
	source: z.enum(["owner-dashboard", "provider-generation"]),
	writer: payer,
	verifier: payer,
});
export type BillingSettlement = z.infer<typeof receipt>;
/** This is accounting evidence supplied by the operator, never a price estimate or an inference request. */
export function validateSettlement(value: unknown, journalSha256: string, keys: string[]): BillingSettlement {
	const parsed = receipt.parse(value);
	if (parsed.journalSha256 !== journalSha256) throw new Error("RECONCILIATION_JOURNAL_MISMATCH");
	if (!keys.includes(parsed.key)) throw new Error("RECONCILIATION_UNKNOWN_SESSION");
	settlementCharges(parsed);
	return parsed;
}
export function settlementCharges(value: BillingSettlement) {
	const result = {
		openRouterMicros: withOpenRouterFee(value.writer.openRouterBaseMicros + value.verifier.openRouterBaseMicros),
		openaiMicros: value.writer.openaiMicros + value.verifier.openaiMicros,
	};
	if (!Object.values(result).every((n) => Number.isSafeInteger(n) && n >= 0))
		throw new Error("RECONCILIATION_INVALID_COST");
	return result;
}
