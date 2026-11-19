import type { Page, Request, Route } from "@playwright/test";

type BatchItem = { url: string; method?: string; headers?: Record<string, string>; body?: unknown };

function batchItems(request: Request): BatchItem[] {
	if (!new URL(request.url()).pathname.endsWith("/__batch__")) return [];
	return request.method() === "GET"
		? JSON.parse(new URL(request.url()).searchParams.get("batch") ?? "[]")
		: request.postDataJSON();
}

export function rpcRequestPaths(request: Request): string[] {
	const items = batchItems(request);
	return items.length ? items.map((item) => new URL(item.url).pathname) : [new URL(request.url()).pathname];
}

/** Fail one logical read while the other reads in its real oRPC batch still reach the server. */
export function failRpcRead(page: Page, path: string) {
	return interceptRpcReads(page, { [path]: { status: 503, body: {} } });
}

export function mockRpcReads(page: Page, values: Record<string, unknown>) {
	return interceptRpcReads(
		page,
		Object.fromEntries(Object.entries(values).map(([path, value]) => [path, { status: 200, body: { json: value } }])),
	);
}

async function interceptRpcReads(page: Page, responsesByPath: Record<string, { status: number; body: unknown }>) {
	const mocked = (url: string) => responsesByPath[new URL(url).pathname.replace(/^\/api\/rpc\//, "")];
	const handler = async (route: Route) => {
		const request = route.request();
		const items = batchItems(request);
		if (!items.length) {
			const response = mocked(request.url());
			if (response)
				await route.fulfill({
					status: response.status,
					contentType: "application/json",
					body: JSON.stringify(response.body),
				});
			else await route.fallback();
			return;
		}
		if (!items.some((item) => mocked(item.url))) return route.fallback();
		const responses = await Promise.all(
			items.map(async (item, index) => {
				const responseMock = mocked(item.url);
				if (responseMock) return { index, ...responseMock };
				const headers = { ...request.headers(), ...item.headers };
				delete headers["x-orpc-batch"];
				delete headers["content-length"];
				const response = await route.fetch({
					url: item.url,
					method: item.method ?? request.method(),
					headers,
					...(item.body === undefined ? {} : { postData: JSON.stringify(item.body) }),
				});
				return { index, status: response.status(), headers: response.headers(), body: await response.json() };
			}),
		);
		await route.fulfill({ status: 207, contentType: "application/json", body: JSON.stringify(responses) });
	};
	await page.route("**/api/rpc/**", handler);
	return () => page.unroute("**/api/rpc/**", handler);
}
