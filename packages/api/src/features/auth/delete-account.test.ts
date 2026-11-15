import { expect, it } from "vite-plus/test";
import { authService } from "./service";
it("legacy deletion cannot bypass proof, consent or cleanup work", async () => {
	await expect(authService.deleteAccount({ userId: "synthetic" })).rejects.toMatchObject({ code: "FORBIDDEN" });
});
