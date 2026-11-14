import type { FakeTransport } from "./runner";
import { usdToMicros } from "@reactive-resume/api/features/ai/adapter";

export const faultNames = [
	"429-once",
	"429-five",
	"429-ten-minutes",
	"500-json",
	"503-json",
	"502-html",
	"504-html",
	"520",
	"524",
	"529",
	"401",
	"402",
	"403",
	"404-once",
	"404-persistent",
	"400-schema",
	"400-invalid-prompt",
	"400-context-length",
	"reject-before-headers",
	"reject-after-dispatch",
	"31s-latency",
	"timeout",
	"mid-body-reset",
	"body-limit",
	"error-with-usage",
	"error-without-usage",
	"choices-empty",
	"finish-error",
	"finish-length",
	"content-filter",
	"refusal",
	"empty-content",
	"fenced-json",
	"schema-invalid",
	"encoded-output",
	"missing-usage",
	"missing-cost",
	"missing-upstream-cost",
	"is-byok-false",
	"generation-lag",
	"missing-provider",
	"wrong-provider",
	"truncated-long-output",
	"deadline-timeout",
] as const;
export type FaultName = (typeof faultNames)[number];
export type Receipt = {
	id: string;
	key: string;
	role: "writer" | "verifier";
	openRouterMicros: number;
	openaiMicros: number;
};
const micros = (value: unknown) => usdToMicros(value) ?? 0;
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** Offline only. Every response is supplied by the runner; this module has no network fallback. */
export function createFaultTransport(input: {
	fault: FaultName | "none";
	role: "writer" | "verifier";
	session: number;
	seed?: number;
	chaos?: boolean;
}) {
	const receipts: Receipt[] = [];
	const sessions = new Map<string, number>();
	const generations = new Map<
		string,
		{ response: Record<string, unknown>; receipt: Receipt; polls: number; lag: boolean }
	>();
	const injections: { fault: FaultName; key: string; role: string; deadlineMs?: number }[] = [];
	let serial = 0;
	let hits = 0;
	let recovered = false;
	let outageStart: number | undefined;
	let state = (input.seed ?? 1) >>> 0;
	const random = () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 2 ** 32;
	};
	const transientFaults: FaultName[] = [
		"429-once",
		"500-json",
		"503-json",
		"502-html",
		"504-html",
		"520",
		"reject-before-headers",
		"31s-latency",
		"error-with-usage",
		"error-without-usage",
		"finish-error",
		"generation-lag",
		"missing-cost",
	];
	const transport: FakeTransport = async (url, init, next, context) => {
		if (init?.method === "GET") {
			const id = new URL(String(url)).searchParams.get("id") ?? "";
			const generation = generations.get(id);
			if (!generation || (generation.lag && generation.polls++ < 2))
				return Response.json({ error: { code: 404 } }, { status: 404 });
			return Response.json({
				data: {
					id,
					total_cost: generation.receipt.openRouterMicros / 1e6,
					upstream_inference_cost: generation.receipt.openaiMicros / 1e6,
					tokens_prompt: (generation.response.usage as { prompt_tokens?: number })?.prompt_tokens,
					tokens_completion: (generation.response.usage as { completion_tokens?: number })?.completion_tokens,
					provider_name: generation.response.provider,
					is_byok: (generation.response.usage as { is_byok?: boolean })?.is_byok ?? context.model.provider === "openai",
				},
			});
		}
		if (!sessions.has(context.key)) sessions.set(context.key, sessions.size + 1);
		let fault: FaultName | "none" = "none";
		if (!recovered && input.chaos && random() < 0.025)
			fault = transientFaults[Math.floor(random() * transientFaults.length)] ?? "none";
		else if (!recovered && !input.chaos && context.role === input.role && sessions.get(context.key) === input.session) {
			const persistent = ["429-ten-minutes", "404-persistent", "400-schema"].includes(input.fault);
			if (persistent || hits < (input.fault === "429-five" ? 5 : 1)) {
				fault = input.fault;
				hits++;
			}
		}
		if (fault === "429-ten-minutes") {
			outageStart ??= Date.now();
			if (Date.now() - outageStart >= 600_000) fault = "none";
		}
		if (fault !== "none")
			injections.push({
				fault,
				key: context.key,
				role: context.role,
				...(context.route ? { deadlineMs: context.route.callTimeoutMs } : {}),
			});
		if (fault === "deadline-timeout") {
			if (!context.route) throw new Error("FAULT_ROUTE_REQUIRED");
			await delay(context.route.callTimeoutMs);
			throw new DOMException("offline contract deadline", "TimeoutError");
		}
		if (fault === "reject-before-headers")
			throw new TypeError("offline connection refused", {
				cause: Object.assign(new Error("offline connect"), { code: "ECONNREFUSED", bytesWritten: 0 }),
			});
		if (fault === "31s-latency") await delay(31_000);
		const status = /^\d{3}/u.test(fault) ? Number(fault.slice(0, 3)) : null;
		if (status !== null) {
			if (fault.endsWith("html")) return new Response("<html>offline gateway failure</html>", { status });
			return Response.json(
				{
					error: {
						code: status,
						message: "Injected provider failure",
						metadata: {
							provider_error_code:
								fault === "400-schema"
									? "invalid_json_schema"
									: fault === "400-invalid-prompt"
										? "invalid_prompt"
										: fault === "400-context-length"
											? "context_length_exceeded"
											: undefined,
							error_type: status === 429 ? "upstream_provider_shared_pool" : undefined,
						},
					},
				},
				{ status, headers: status === 429 ? { "retry-after": "1" } : {} },
			);
		}
		const data = await (await next()).json();
		const id = `offline-${++serial}`;
		data.id = id;
		if (fault === "is-byok-false" && context.model.provider === "openai") {
			data.usage.is_byok = false;
			data.usage.cost = 0.000003;
			data.usage.cost_details.upstream_inference_cost = 0;
		}
		if (fault === "error-with-usage") {
			data.error = { code: 503 };
			data.usage = {
				cost: 0.000002,
				cost_details: { upstream_inference_cost: context.model.provider === "openai" ? 0.000003 : 0 },
				is_byok: context.model.provider === "openai",
			};
		}
		if (fault === "error-without-usage") {
			data.error = { code: 503 };
			delete data.usage;
		}
		if (fault === "wrong-provider") data.provider = "offline-wrong-provider";
		const receipt: Receipt = {
			id,
			key: context.key,
			role: context.role,
			openRouterMicros: micros(data.usage?.cost),
			openaiMicros: context.model.provider === "openai" ? micros(data.usage?.cost_details?.upstream_inference_cost) : 0,
		};
		receipts.push(receipt);
		generations.set(id, { response: { ...data }, receipt, polls: 0, lag: fault === "generation-lag" });
		if (fault === "reject-after-dispatch")
			throw new TypeError("offline connection reset", {
				cause: Object.assign(new Error("offline request sent"), { code: "ECONNRESET", bytesWritten: 128 }),
			});
		if (fault === "timeout")
			throw Object.assign(new DOMException("offline generation timeout", "TimeoutError"), { generationId: id });
		if (fault === "missing-usage") delete data.usage;
		if (fault === "missing-cost" || fault === "generation-lag") delete data.usage.cost;
		if (fault === "missing-upstream-cost") delete data.usage.cost_details;
		if (fault === "missing-provider") delete data.provider;
		if (fault === "choices-empty") data.choices = [];
		if (["finish-error", "finish-length", "content-filter"].includes(fault))
			data.choices[0].finish_reason =
				fault === "finish-error" ? "error" : fault === "finish-length" ? "length" : "content_filter";
		if (fault === "refusal") {
			data.choices[0].message.content = null;
			data.choices[0].message.refusal = "Offline policy refusal";
		}
		if (fault === "empty-content") data.choices[0].message.content = "";
		if (fault === "truncated-long-output") {
			const content = data.choices[0].message.content as string;
			data.choices[0].message.content = content.slice(0, Math.floor(content.length / 2));
			data.choices[0].finish_reason = "length";
		}
		if (fault === "schema-invalid") data.choices[0].message.content = '{"invalid":true}';
		if (fault === "fenced-json")
			data.choices[0].message.content = `\`\`\`json\n${data.choices[0].message.content}\n\`\`\``;
		if (fault === "encoded-output") {
			if (context.role === "writer") {
				const output = JSON.parse(data.choices[0].message.content);
				output.notes.push("&amp;");
				data.choices[0].message.content = JSON.stringify(output);
			} else
				data.choices[0].message.content = data.choices[0].message.content.replace(/"reason":"/u, '"reason":"&amp; ');
		}
		if (fault === "mid-body-reset" || fault === "body-limit") {
			return new Response(
				new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode(`{"id":"${id}","partial":"`));
					},
					pull(controller) {
						if (fault === "body-limit") {
							controller.enqueue(new Uint8Array(1048577));
							controller.close();
						} else controller.error(new TypeError("offline body reset"));
					},
				}),
			);
		}
		return Response.json(data);
	};
	return {
		transport,
		receipts,
		injections,
		recover() {
			recovered = true;
		},
		generationIds: () => [...generations.keys()],
	};
}
