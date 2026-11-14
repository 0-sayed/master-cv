import { AiTransportError, usdToMicros } from "@reactive-resume/api/features/ai/adapter";

const micros = usdToMicros;
const generationId = (text: string) => /"id"\s*:\s*"([A-Za-z0-9_-]+)"/u.exec(text)?.[1] ?? null;
async function readBounded(response: Response, chunks: Uint8Array[]) {
	const reader = response.body?.getReader();
	let bytes = 0;
	try {
		if (reader)
			for (;;) {
				const part = await reader.read();
				if (part.done) break;
				bytes += part.value.length;
				chunks.push(part.value);
				if (bytes > 1048576) throw new Error("AI_RESPONSE_LIMIT");
			}
	} finally {
		// Cancellation of an errored stream rejects with the same error. Do not replace the original.
		await reader?.cancel().catch(() => {});
	}
}
/** A GET only: a failed generation is never resubmitted to discover its bill. */
async function lookupOnce(base: typeof fetch, id: string, init?: RequestInit) {
	try {
		const response = await base(`https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(id)}`, {
			method: "GET",
			...(init?.headers ? { headers: init.headers } : {}),
			redirect: "error",
			signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(5000)]),
		});
		const chunks: Uint8Array[] = [];
		await readBounded(response, chunks);
		const data = JSON.parse(Buffer.concat(chunks).toString("utf8")).data;
		if (!response.ok || data?.id !== id) return null;
		return {
			costMicros: micros(data.total_cost),
			upstreamCostMicros: micros(data.upstream_inference_cost),
			provider: typeof data.provider_name === "string" ? data.provider_name : null,
			inputTokens: data.tokens_prompt,
			outputTokens: data.tokens_completion,
			isByok: data.is_byok,
		};
	} catch {
		return null;
	}
}
/** Generation metadata can lag the completion response. Retry GET only, never inference. */
async function lookup(base: typeof fetch, id: string, init?: RequestInit) {
	const byok = JSON.parse(String(init?.body ?? "{}")).provider?.only?.includes("openai") === true;
	let latest: Awaited<ReturnType<typeof lookupOnce>> = null;
	for (let attempt = 0; attempt < 3; attempt++) {
		const bill = await lookupOnce(base, id, init);
		if (bill) latest = bill;
		if (
			bill &&
			bill.costMicros !== null &&
			bill.provider &&
			Number.isSafeInteger(bill.inputTokens) &&
			Number.isSafeInteger(bill.outputTokens) &&
			(!byok || (bill.upstreamCostMicros !== null && typeof bill.isByok === "boolean"))
		)
			return bill;
		if (attempt < 2) await new Promise<void>((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
	}
	return latest;
}
/** Retain status/partial-byte evidence before the production adapter sees a response. */
export async function captureResponse(
	base: typeof fetch,
	url: Parameters<typeof fetch>[0],
	init?: RequestInit,
	reconcile = true,
) {
	let response: Response;
	try {
		response = await base(url, init);
	} catch (error) {
		if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name))
			throw new AiTransportError(error, {
				httpStatus: null,
				bytesReceived: false,
				generationId: null,
				costMicros: null,
				upstreamCostMicros: null,
			});
		throw error;
	}
	const chunks: Uint8Array[] = [];
	try {
		await readBounded(response, chunks);
	} catch (error) {
		const id = generationId(Buffer.concat(chunks).toString("utf8"));
		const bill = id && reconcile ? await lookup(base, id, init) : null;
		throw new AiTransportError(error, {
			httpStatus: response.status,
			bytesReceived: chunks.some((c) => c.length > 0),
			generationId: id,
			costMicros: bill?.costMicros ?? (response.status >= 400 ? 0 : null),
			upstreamCostMicros: bill?.upstreamCostMicros ?? (response.status >= 400 ? 0 : null),
		});
	}
	let text = Buffer.concat(chunks).toString("utf8");
	try {
		const data = JSON.parse(text);
		if (
			reconcile &&
			typeof data.id === "string" &&
			(data.error ||
				!data.provider ||
				!data.usage ||
				micros(data.usage?.cost) === null ||
				(JSON.parse(String(init?.body)).provider.only.includes("openai") &&
					(micros(data.usage?.cost_details?.upstream_inference_cost) === null ||
						typeof data.usage?.is_byok !== "boolean")))
		) {
			const bill = await lookup(base, data.id, init);
			if (bill) {
				data.usage ??= {};
				if (!data.provider && bill.provider) data.provider = bill.provider;
				if (data.usage.prompt_tokens === undefined && Number.isSafeInteger(bill.inputTokens))
					data.usage.prompt_tokens = bill.inputTokens;
				if (data.usage.completion_tokens === undefined && Number.isSafeInteger(bill.outputTokens))
					data.usage.completion_tokens = bill.outputTokens;
				if (bill.isByok !== undefined) data.usage.is_byok = bill.isByok;
				if (bill.costMicros !== null) data.usage.cost = bill.costMicros / 1e6;
				if (bill.upstreamCostMicros !== null)
					data.usage.cost_details = {
						...data.usage.cost_details,
						upstream_inference_cost: bill.upstreamCostMicros / 1e6,
					};
				text = JSON.stringify(data);
			}
		}
	} catch {
		/* Malformed bodies remain visible to the strict adapter. */
	}
	return new Response(text, { status: response.status, headers: response.headers });
}
