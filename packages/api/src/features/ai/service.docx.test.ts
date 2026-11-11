import { expect, it, vi } from "vite-plus/test";
const generate = vi.hoisted(() => vi.fn());
vi.mock("ai", async (original) => ({ ...(await original<typeof import("ai")>()), generateText: generate }));
vi.mock("@reactive-resume/env/server", () => ({ env: { FLAG_ALLOW_UNSAFE_AI_BASE_URL: false } }));
const { aiService } = await import("./service");
it.each(["parsePdf", "parseDocx"] as const)(
	"denies %s before provider setup or content processing",
	async (operation) => {
		await expect(
			aiService[operation]({
				provider: "openai",
				model: "unused",
				apiKey: "unused",
				baseURL: "",
				file: { name: "private", data: "synthetic@example.test" },
				mediaType: "application/msword",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(generate).not.toHaveBeenCalled();
	},
);
