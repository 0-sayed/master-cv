import type { AIProvider } from "@reactive-resume/ai/types";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createCerebras } from "@ai-sdk/cerebras";
import { createCohere } from "@ai-sdk/cohere";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createFireworks } from "@ai-sdk/fireworks";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createPerplexity } from "@ai-sdk/perplexity";
import { createTogetherAI } from "@ai-sdk/togetherai";
import { createXai } from "@ai-sdk/xai";
import { ORPCError } from "@orpc/server";
import { APICallError, createGateway, generateText, LoadAPIKeyError, NoSuchModelError } from "ai";
import { createOllama } from "ollama-ai-provider-v2";
import { match } from "ts-pattern";
import { z } from "zod";
import { AI_PROVIDER_DEFAULT_BASE_URLS, AI_PROVIDER_DISPLAY_NAMES, aiProviderSchema } from "@reactive-resume/ai/types";
import { isDirectOpenAIProvider } from "./capabilities";
import { resolveAiBaseUrl } from "./url-policy";

type GetModelInput = {
	provider: AIProvider;
	model: string;
	apiKey: string;
	baseURL?: string;
};

const MAX_AI_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_AI_FILE_BASE64_CHARS = Math.ceil((MAX_AI_FILE_BYTES * 4) / 3) + 4;
const TEST_CONNECTION_MAX_OUTPUT_TOKENS = 128;

// AbortSignal.timeout stores the delay as a 32-bit signed integer.
const MAX_ABORT_SIGNAL_TIMEOUT_MS = 2_147_483_647;

// Long enough for a cold local model to load, short enough that the UI does not look frozen.
// Self-hosted deployments with cold-start models (e.g. Ollama) can override via AI_TEST_TIMEOUT_MS.
const TEST_CONNECTION_TIMEOUT_MS = z.coerce
	.number()
	.int()
	.nonnegative()
	.max(MAX_ABORT_SIGNAL_TIMEOUT_MS)
	.catch(30_000)
	.parse(process.env.AI_TEST_TIMEOUT_MS?.trim() || undefined);

export function getModel(input: GetModelInput) {
	const { provider, model, apiKey } = input;
	const baseURL = resolveAiBaseUrl(input);

	return match(provider)
		.with("openai", () => createOpenAI({ apiKey, baseURL }).chat(model))
		.with("anthropic", () => createAnthropic({ apiKey, baseURL }).languageModel(model))
		.with("gemini", () => createGoogleGenerativeAI({ apiKey, baseURL }).languageModel(model))
		.with("vercel-ai-gateway", () => createGateway({ apiKey, baseURL }).languageModel(model))
		.with("openrouter", () => createOpenAICompatible({ name: "openrouter", apiKey, baseURL }).languageModel(model))
		.with("mistral", () => createMistral({ apiKey, baseURL }).languageModel(model))
		.with("cohere", () => createCohere({ apiKey, baseURL }).languageModel(model))
		.with("xai", () => createXai({ apiKey, baseURL }).languageModel(model))
		.with("groq", () => createGroq({ apiKey, baseURL }).languageModel(model))
		.with("deepseek", () => createDeepSeek({ apiKey, baseURL }).languageModel(model))
		.with("togetherai", () => createTogetherAI({ apiKey, baseURL }).languageModel(model))
		.with("fireworks", () => createFireworks({ apiKey, baseURL }).languageModel(model))
		.with("cerebras", () => createCerebras({ apiKey, baseURL }).languageModel(model))
		.with("perplexity", () => createPerplexity({ apiKey, baseURL }).languageModel(model))
		.with("openai-compatible", () =>
			createOpenAICompatible({ name: "openai-compatible", apiKey, baseURL }).languageModel(model),
		)
		.with("ollama", () => {
			const ollama = createOllama({
				name: "ollama",
				baseURL,
				...(apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {}),
			});

			return ollama.languageModel(model);
		})
		.exhaustive();
}

export function getAgentModel(input: GetModelInput) {
	if (!isDirectOpenAIProvider(input)) return getModel(input);

	// Direct OpenAI assistants use Responses for reasoning with function tools.
	return createOpenAI({ apiKey: input.apiKey, baseURL: resolveAiBaseUrl(input) }).responses(input.model);
}

const aiCredentialsSchema = z.object({
	provider: aiProviderSchema,
	model: z.string().trim().min(1),
	apiKey: z.string().trim().min(1),
	baseURL: z.string().optional().default(""),
});

export const fileInputSchema = z.object({
	name: z.string(),
	data: z.string().max(MAX_AI_FILE_BASE64_CHARS, "File is too large. Maximum size is 10MB."),
});

type TestConnectionInput = z.infer<typeof aiCredentialsSchema>;

type TestConnectionResult = { ok: true } | { ok: false; message: string };

const NETWORK_ERROR_CODES = new Set([
	"ECONNREFUSED",
	"ECONNRESET",
	"EAI_AGAIN",
	"ENOTFOUND",
	"ETIMEDOUT",
	"UND_ERR_CONNECT_TIMEOUT",
	"UND_ERR_SOCKET",
]);

// Provider SDKs wrap the useful error (a socket failure, an abort) inside a generic one, so the
// signal we need is usually a few `cause` hops down rather than on the error we are handed.
function findInCauseChain<T>(error: unknown, pick: (candidate: unknown) => T | undefined): T | undefined {
	let current = error;

	for (let depth = 0; depth < 8 && current !== null && current !== undefined; depth++) {
		const picked = pick(current);
		if (picked !== undefined) return picked;
		current = (current as { cause?: unknown }).cause;
	}

	return undefined;
}

function isTimeout(error: unknown): boolean {
	return (
		findInCauseChain(error, (candidate) =>
			candidate instanceof Error && (candidate.name === "TimeoutError" || candidate.name === "AbortError")
				? true
				: undefined,
		) ?? false
	);
}

function findNetworkErrorCode(error: unknown): string | undefined {
	return findInCauseChain(error, (candidate) => {
		const code = (candidate as { code?: unknown }).code;

		return typeof code === "string" && NETWORK_ERROR_CODES.has(code) ? code : undefined;
	});
}

// The key is never part of a response body, but a provider echoing the request would leak it into
// the message we persist, so scrub it from anything we did not write ourselves. The schema allows
// keys as short as one character, and a mangled message costs less than a leaked credential, so
// every non-empty key is redacted. The guard only keeps `replaceAll` from splicing "***" between
// every character of the message.
function redactApiKey(message: string, apiKey: string): string {
	if (!apiKey) return message;

	return message.replaceAll(apiKey, "***");
}

function describeTestConnectionFailure(input: TestConnectionInput, error: unknown): string {
	const provider = AI_PROVIDER_DISPLAY_NAMES[input.provider];
	const endpoint = input.baseURL.trim() || AI_PROVIDER_DEFAULT_BASE_URLS[input.provider];

	if (isTimeout(error)) {
		return `${provider} did not respond within ${TEST_CONNECTION_TIMEOUT_MS / 1000} seconds. The service may be unreachable, or the model may be too slow to load.`;
	}

	if (findNetworkErrorCode(error)) {
		return endpoint
			? `Could not reach ${endpoint}. Check that the base URL is correct and the service is running.`
			: `${provider} could not be reached. Check that the base URL is correct and the service is running.`;
	}

	if (LoadAPIKeyError.isInstance(error)) return `${provider} was configured without an API key.`;
	if (NoSuchModelError.isInstance(error)) return `${provider} has no model named "${input.model}".`;

	if (APICallError.isInstance(error)) {
		const status = error.statusCode;

		if (status === 401 || status === 403) return `${provider} rejected the API key.`;
		if (status === 404) return `${provider} has no model named "${input.model}", or the base URL is wrong.`;
		if (status === 429) return `${provider} rate-limited the test. Wait a moment and try again.`;
		if (status !== undefined && status >= 500) {
			return `${provider} reported a server error (${status}). This is a problem on the provider's side.`;
		}

		return `${provider} rejected the test request${status === undefined ? "" : ` (${status})`}: ${redactApiKey(error.message, input.apiKey)}`;
	}

	if (error instanceof Error && error.message) {
		return `${provider} could not be tested: ${redactApiKey(error.message, input.apiKey)}`;
	}

	return `${provider} could not be tested, and reported no reason.`;
}

export async function testConnection(input: TestConnectionInput): Promise<TestConnectionResult> {
	const RESPONSE_OK = "1";
	const provider = AI_PROVIDER_DISPLAY_NAMES[input.provider];

	// Resolved outside the try so the base-URL policy error still reaches the router, which turns it
	// into an invalid-configuration response rather than a provider failure.
	const model = getModel(input);

	let result: Awaited<ReturnType<typeof generateText>>;

	try {
		result = await generateText({
			model,
			maxOutputTokens: TEST_CONNECTION_MAX_OUTPUT_TOKENS,
			// A connection test must not silently multiply its own wait by retrying behind the user.
			maxRetries: 0,
			abortSignal: AbortSignal.timeout(TEST_CONNECTION_TIMEOUT_MS),
			messages: [{ role: "user", content: `Respond only with the single character: ${RESPONSE_OK}` }],
		});
	} catch (error) {
		return { ok: false, message: describeTestConnectionFailure(input, error) };
	}

	if (result.text.trim() === RESPONSE_OK) return { ok: true };

	if (result.finishReason === "length") {
		return {
			ok: false,
			message: `${provider} is reachable, but the model returned too much text during the test. Try a model that follows short instructions.`,
		};
	}

	return {
		ok: false,
		message: `${provider} is reachable, but the model replied with unexpected output instead of a simple confirmation.`,
	};
}

type ParsePdfInput = z.infer<typeof aiCredentialsSchema> & {
	file: z.infer<typeof fileInputSchema>;
};

type ParseDocxInput = ParsePdfInput & {
	mediaType: "application/msword" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
};
// oxlint-disable-next-line require-await -- Keep the asynchronous service contract while attachment processing is gated.
async function parsePdf(_input: ParsePdfInput): Promise<ResumeData> {
	throw new ORPCError("FORBIDDEN", {
		message: "Attachment processing by AI is unavailable. Use native PDF import and review.",
	});
}
// oxlint-disable-next-line require-await -- Keep the asynchronous service contract while attachment processing is gated.
async function parseDocx(_input: ParseDocxInput): Promise<ResumeData> {
	throw new ORPCError("FORBIDDEN", { message: "Word import is not available." });
}

export const aiService = {
	parseDocx,
	parsePdf,
	testConnection,
};
