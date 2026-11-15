import { downloadAccountExport } from "@reactive-resume/api/features/privacy/delivery";
export async function handleAccountExport(request: Request, id: string) {
	const headers = {
		"Cache-Control": "private, no-store",
		"Referrer-Policy": "no-referrer",
		"X-Content-Type-Options": "nosniff",
	};
	try {
		const result = await downloadAccountExport({ headers: request.headers, id });
		return new Response(result.body, {
			headers: {
				...headers,
				"Content-Type": result.contentType,
				"Content-Disposition": 'attachment; filename="account-data.zip"',
			},
		});
	} catch {
		return Response.json({ error: "EXPORT_UNAVAILABLE" }, { status: 404, headers });
	}
}
