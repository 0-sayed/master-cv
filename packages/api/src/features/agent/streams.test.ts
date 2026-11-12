import { expect, it } from "vite-plus/test";
import { createAgentStreamLifecycle } from "./streams";

it("does not represent unsupported or expired stream resumption as a successful empty reply", async () => {
	const missingRedis = createAgentStreamLifecycle({ getContext: () => null });
	await expect(missingRedis.resume("stream")).rejects.toMatchObject({ data: { reason: "AI_RESUME_UNSUPPORTED" } });
	const expired = createAgentStreamLifecycle({
		getContext: () => ({ createNewResumableStream: async () => null, resumeExistingStream: async () => null }),
	});
	await expect(expired.resume("stream")).rejects.toMatchObject({ data: { reason: "AI_RESUME_EXPIRED" } });
});
