import { usdToMicros } from "@reactive-resume/api/features/ai/adapter";

export type BillingPrice = { inputPerMillion: number; outputPerMillion: number };
export type Charge = { router: number | null; openai: number | null; source: string };
type RecordedResponse = {
	key: string;
	body: string;
	status: number;
	model?: string;
	provider?: string;
	billingPrice?: BillingPrice;
};
type RecordedFailure = {
	key: string;
	failure: { httpStatus: number | null; bytesReceived: boolean; generationId: string | null; requestSent?: boolean };
};
type HeldCall = {
	key: string;
	costMicros: number | null;
	openRouterCostMicros?: number | null;
	openaiCostMicros?: number | null;
	unknownExposureMicros?: number;
	billingNotes?: string[];
	priorAttemptOpenRouterMicros?: number;
	priorAttemptOpenaiMicros?: number;
	totalOpenRouterBaseMicros?: number | null;
	verifierJudgments?: { attempts: { key: string; costMicros: number | null }[] }[];
};

/** A failed generated document does not invalidate the enclosing response's usage. */
export function responseCharge(body: string, status: number, price?: BillingPrice, byok = false): Charge {
	try {
		const data = JSON.parse(body);
		const usage = data.usage;
		if (usage === undefined && (data.error || status >= 400))
			return { router: 0, openai: 0, source: "unbilled-provider-error" };
		const routedByok = byok && usage?.is_byok !== false;
		let router = usdToMicros(usage?.cost);
		let openai = routedByok ? usdToMicros(usage?.cost_details?.upstream_inference_cost) : 0;
		let source = "response-usage";
		const input = usage?.prompt_tokens ?? usage?.input_tokens;
		const output = usage?.completion_tokens ?? usage?.output_tokens;
		if (price && Number.isSafeInteger(input) && input >= 0 && Number.isSafeInteger(output) && output >= 0) {
			// Completion tokens already include reasoning. Never subtract or add them again.
			const estimate = Math.ceil(input * price.inputPerMillion + output * price.outputPerMillion);
			if (Number.isSafeInteger(estimate) && estimate >= 0) {
				if (routedByok && openai === null) {
					openai = estimate;
					source = "usage-price-snapshot";
				} else if (!routedByok && router === null) {
					router = estimate;
					source = "usage-price-snapshot";
				}
			}
		}
		return { router, openai, source };
	} catch {
		if (status >= 400) return { router: 0, openai: 0, source: "unbilled-provider-error" };
		return { router: null, openai: byok ? null : 0, source: "unresolved-response" };
	}
}

/** Ten percent of the payer caps, at most $5. All unknown calls keep their reservations. */
export const unknownExposureLimit = (routerUsd: number, openaiUsd: number) =>
	Math.min(5_000_000, Math.floor((routerUsd + openaiUsd) * 100_000));

export async function settleRecordedCalls<T extends HeldCall>(
	calls: T[],
	raws: RecordedResponse[],
	attempts: RecordedFailure[],
	models: (BillingPrice & { model: string; provider: string })[],
	lookup?: (id: string, byok: boolean) => Promise<Charge | null>,
): Promise<(T & { billingNotes?: string[] })[]> {
	const belongs = (key: string, parent: string) => key === parent || key.startsWith(`${parent}:`);
	const settled: (T & { billingNotes?: string[] })[] = [];
	for (const call of calls) {
		const negativeSettlement = [call.costMicros, call.openRouterCostMicros, call.openaiCostMicros].some(
			(cost) => cost != null && cost < 0,
		);
		if (call.costMicros !== null && !negativeSettlement) {
			settled.push(call);
			continue;
		}
		const responses = raws.filter((r) => belongs(r.key, call.key));
		const failures = attempts.filter((a) => belongs(a.key, call.key));
		const ids = new Set<string>();
		const notes: string[] = [];
		let router = 0;
		let openai = 0;
		let unresolved =
			(responses.length === 0 && failures.length === 0) ||
			(call.verifierJudgments ?? []).some((judgment) =>
				judgment.attempts.some(
					(attempt) =>
						attempt.costMicros === null &&
						!responses.some((response) => response.key === attempt.key) &&
						!failures.some((failure) => failure.key === attempt.key),
				),
			);
		for (const raw of responses) {
			const model = models.find((m) => m.model === raw.model && (!raw.provider || m.provider === raw.provider));
			const byok = raw.provider === "openai";
			const id = /"id"\s*:\s*"([A-Za-z0-9_-]+)"/u.exec(raw.body)?.[1];
			if (id && ids.has(id)) continue;
			if (id) ids.add(id);
			let bill = responseCharge(raw.body, raw.status, undefined, byok);
			if ((bill.router === null || bill.openai === null) && id && lookup) {
				const metadata = await lookup(id, byok);
				if (metadata)
					bill = {
						router: bill.router ?? metadata.router,
						openai: bill.openai ?? metadata.openai,
						source: metadata.source,
					};
			}
			if (bill.router === null || bill.openai === null) {
				const priced = responseCharge(raw.body, raw.status, raw.billingPrice ?? model, byok);
				bill = { router: bill.router ?? priced.router, openai: bill.openai ?? priced.openai, source: priced.source };
			}
			if (bill.router === null || bill.openai === null) unresolved = true;
			else {
				router += bill.router;
				openai += bill.openai;
				notes.push(`${raw.key}: ${bill.source}`);
			}
		}
		for (const { failure, key } of failures) {
			if (failure.generationId && ids.has(failure.generationId)) continue;
			if (
				!failure.requestSent &&
				!failure.bytesReceived &&
				failure.generationId === null &&
				(failure.httpStatus === null || key.includes(":verify"))
			) {
				notes.push(
					failure.httpStatus === null
						? "recorded connection failure before response: zero cost (Sayed D39)"
						: "recorded verifier attempt without response bytes: zero cost (Sayed D39)",
				);
				continue;
			}
			const writer = models.find((m) => m.model === (call as HeldCall & { model?: string }).model);
			const byok = !key.includes(":verify") && writer?.provider === "openai";
			const bill = failure.generationId && lookup ? await lookup(failure.generationId, byok) : null;
			if (!bill || bill.router === null || bill.openai === null) unresolved = true;
			else {
				router += bill.router;
				openai += bill.openai;
				if (failure.generationId) ids.add(failure.generationId);
				notes.push(`${key}: ${bill.source}`);
			}
		}
		// An earlier response can still have an unknown bill. Undo only the bad subtraction,
		// retain that earlier reservation, and use the independently recorded new charge.
		const restoredRouter = (call.openRouterCostMicros ?? 0) + (call.priorAttemptOpenRouterMicros ?? 0);
		if (
			negativeSettlement &&
			unresolved &&
			(call.openRouterCostMicros ?? 0) < 0 &&
			Number.isSafeInteger(restoredRouter) &&
			restoredRouter >= 0 &&
			restoredRouter === call.totalOpenRouterBaseMicros &&
			router >= restoredRouter &&
			call.openaiCostMicros != null &&
			call.openaiCostMicros >= 0
		) {
			settled.push({
				...call,
				costMicros: restoredRouter + call.openaiCostMicros,
				openRouterCostMicros: restoredRouter,
				billingNotes: [
					...(call.billingNotes ?? []),
					"repaired negative settlement from recorded attempt charge; prior unknown charge remains held (Sayed D39)",
				],
			});
			continue;
		}
		const routerCost = negativeSettlement ? router : (call.openRouterCostMicros ?? router);
		const openaiCost = call.openaiCostMicros ?? openai;
		settled.push(
			unresolved
				? call
				: {
						...call,
						costMicros: routerCost + openaiCost,
						openRouterCostMicros: routerCost,
						openaiCostMicros: openaiCost,
						totalOpenRouterBaseMicros: routerCost,
						unknownExposureMicros: 0,
						...(negativeSettlement ? { priorAttemptOpenRouterMicros: 0, priorAttemptOpenaiMicros: 0 } : {}),
						billingNotes: [
							...(call.billingNotes ?? []),
							...notes,
							...(negativeSettlement ? ["repaired negative settlement from recorded paid receipts (Sayed D39)"] : []),
						],
					},
		);
	}
	return settled;
}

/** Actual expenses are final. Only a later reservation can stop dispatch at the payer cap. */
export function settleFinishedCharge(
	ledger: { consumed: number },
	reserved: number,
	actual: number | null,
	payer: string,
): string | null {
	if (!Number.isSafeInteger(reserved) || reserved < 0) throw new Error("INVALID_BOUND");
	if (actual === null) return null;
	if (!Number.isSafeInteger(actual) || actual < 0) throw new Error("INVALID_SETTLED_COST");
	ledger.consumed += actual - reserved;
	return actual > reserved
		? `${payer}: settled ${actual} microdollars exceeded reservation by ${actual - reserved} microdollars (Sayed D39)`
		: null;
}
