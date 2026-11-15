import { expect, it } from "vite-plus/test";
import { authService } from "./service";
it("legacy export cannot bypass the browser proof and durable archive", async () => {
	await expect(authService.exportData({ userId: "synthetic" })).rejects.toMatchObject({ code: "FORBIDDEN" });
});
