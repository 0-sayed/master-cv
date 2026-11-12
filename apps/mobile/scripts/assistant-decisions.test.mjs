// Exercise the shipped conversation's undo effect with native and transport boundaries.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const serverRequire = createRequire(new URL("../../server/package.json", import.meta.url));
const { transformSync } = createRequire(serverRequire.resolve("tsx"))("esbuild");

test("mobile undo sends the accepted status required by compare-and-set", async () => {
	const effects = [];
	const requests = [];
	const proposal = { id: "edit-1", status: "accepted" };
	const part = { type: "tool-propose_edits", toolCallId: "tool-1" };
	const messages = [{ id: "message-1", role: "assistant", parts: [part] }];
	const react = {
		createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
		useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
		useRef: (current) => ({ current }),
		useMemo: (work) => work(),
		useEffect: (effect) => effects.push(effect),
		useEffectEvent: (handler) => handler,
	};
	const boundaries = {
		react,
		"@legendapp/list/react-native": { LegendList: "LegendList" },
		"@lingui/react/macro": { Trans: "Trans", useLingui: () => ({ t: (parts) => parts.join("") }) },
		"@orpc/client": { ORPCError: class extends Error {} },
		"@tanstack/react-query": { useQueryClient: () => ({}) },
		ai: { lastAssistantMessageIsCompleteWithToolCalls: () => false },
		"expo-clipboard": {},
		"expo-document-picker": {},
		"expo-file-system": {},
		"react-native": { AppState: { addEventListener: () => ({ remove() {} }) } },
		"react-native-keyboard-controller": {},
		"./chat": { useAssistantChat: () => ({ messages, status: "ready", instance: {} }), refreshThreads() {} },
		"./messages": {},
		"./proposals": { isProposeEdits: (value) => value === part, toProposals: () => [proposal], publishProposals() {} },
		"./recovery": { createRequestLane: () => ({ cancel: async () => {} }) },
		"@/api/client": {
			client: { agent: { messages: { setEditStatus: async (input) => requests.push(input) } } },
		},
		"@/auth/session": {},
		"@/ui": { useTheme: () => ({ colors: {}, space: { s4: 16 }, radius: {} }) },
		"@/ui/use-pull-refresh": { usePullRefresh: () => ({}) },
	};
	const source = readFileSync(new URL("../src/features/assistant/chat-view.tsx", import.meta.url), "utf8");
	const code = transformSync(source + "\nexport { Conversation };", {
		loader: "tsx",
		format: "cjs",
		jsx: "transform",
	}).code;
	const module = { exports: {} };
	new Function("React", "require", "module", "exports", code)(
		react,
		(name) => {
			assert.ok(name in boundaries, `Missing boundary fixture: ${name}`);
			return boundaries[name];
		},
		module,
		module.exports,
	);
	module.exports.Conversation({
		threadId: "thread-1",
		scope: "owner",
		initialMessages: messages,
		activeRun: false,
		context: { document: true, posting: true },
		document: { id: "resume-1", kind: "resume", stateOf: () => "pending" },
	});
	for (const effect of effects) effect();
	await Promise.resolve();
	assert.deepEqual(requests, [
		{
			threadId: "thread-1",
			messageId: "message-1",
			toolCallId: "tool-1",
			edits: [{ id: "edit-1", status: "pending", expectedStatus: "accepted" }],
		},
	]);
});
