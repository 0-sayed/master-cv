import { expect, it, vi } from "vite-plus/test";
const download = vi.hoisted(() => vi.fn());
vi.mock("@reactive-resume/api/features/privacy/delivery", () => ({ downloadAccountExport: download }));
import { handleAccountExport } from "./account-export";

it.each([
	["BROWSER_SESSION_REQUIRED", 401],
	["ORIGIN_DENIED", 403],
	["EXPORT_UNAVAILABLE", 404],
	["private storage error", 500],
])("returns the correct private HTTP status for %s", async (message, status) => {
	const log = vi.spyOn(console, "error").mockImplementation(() => {});
	try {
		download.mockRejectedValueOnce(new Error(message));
		const response = await handleAccountExport(new Request("https://resume.example/api/privacy/exports/id"), "id");
		expect(response.status).toBe(status);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(await response.json()).toEqual({ error: "EXPORT_UNAVAILABLE" });
		if (status === 500) expect(log).toHaveBeenCalledWith({ event: "account_export_download_failed" });
	} finally {
		log.mockRestore();
	}
});
