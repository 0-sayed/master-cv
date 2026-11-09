import type { InferRouterOutputs, RouterClient } from "@orpc/server";
import type router from "@reactive-resume/api/routers";
import { createORPCClient, onError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { BatchLinkPlugin } from "@orpc/client/plugins";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { rpcFetch } from "./fetch";

const getRpcUrl = () => `${window.location.origin}/api/rpc`;

function handleRpcError(error: unknown) {
	if (error instanceof DOMException && error.name === "AbortError") return;
	if (error && typeof error === "object" && "code" in error && error.code === "UNAUTHORIZED")
		window.dispatchEvent(new Event("master-cv:session-expired"));
	console.warn("[oRPC client]", error);
}

export const client: RouterClient<typeof router> = createORPCClient(
	new RPCLink({
		url: getRpcUrl,
		fetch: rpcFetch,
		plugins: [
			new BatchLinkPlugin({
				mode: "streaming",
				groups: [{ condition: () => true, context: {} }],
			}),
		],
		interceptors: [onError(handleRpcError)],
	}),
);

export const streamClient: RouterClient<typeof router> = createORPCClient(
	new RPCLink({
		url: getRpcUrl,
		fetch: rpcFetch,
		interceptors: [onError(handleRpcError)],
	}),
);

export const orpc = createTanstackQueryUtils(client);

export type RouterOutput = InferRouterOutputs<typeof router>;
