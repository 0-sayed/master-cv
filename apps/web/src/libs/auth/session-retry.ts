/** Better Fetch reconstructs its error after hooks, so carry metadata in this response's error body. */
export async function sessionRetryResponse(url: string | URL, response: Response): Promise<Response> {
	if (!new URL(String(url), "http://localhost").pathname.endsWith("/get-session") || response.status !== 429)
		return response;
	const seconds = Number(response.headers.get("x-retry-after"));
	if (!Number.isFinite(seconds) || seconds <= 0) return response;
	const body: unknown = await response
		.clone()
		.json()
		.catch(() => null);
	const headers = new Headers(response.headers);
	headers.delete("content-length");
	return Response.json(
		{ ...(body && typeof body === "object" ? body : {}), retryAfterMs: seconds * 1_000 },
		{ status: response.status, statusText: response.statusText, headers },
	);
}
