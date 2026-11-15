// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { QueryClient } from "@tanstack/react-query";
import { prepareFirstCvCelebration } from "./first-cv-celebration";
const add = vi.hoisted(() => vi.fn());
vi.mock("@reactive-resume/ui/components/toast", () => ({ toast: { add } }));
vi.mock("@/libs/orpc/client", () => ({
	orpc: { documents: { counts: { queryKey: () => ["documents", "counts"] } } },
}));
beforeEach(() => {
	vi.clearAllMocks();
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
});
it("waits for acknowledged creation and celebrates a known first CV only once", () => {
	const client = new QueryClient();
	client.setQueryData(["documents", "counts"], { resume: 0, trash: 0 });
	const acknowledge = prepareFirstCvCelebration(client);
	expect(add).not.toHaveBeenCalled();
	acknowledge();
	acknowledge();
	expect(add).toHaveBeenCalledExactlyOnceWith({ type: "celebration", description: "Saved" });
});
it.each([undefined, { resume: 1, trash: 0 }, { resume: 0, trash: 1 }])(
	"does not infer a first CV from unknown or nonempty counts (%j)",
	(counts) => {
		const client = new QueryClient();
		if (counts) client.setQueryData(["documents", "counts"], counts);
		prepareFirstCvCelebration(client)();
		expect(add).not.toHaveBeenCalled();
	},
);

it("complements an existing success message instead of replacing it", () => {
	const client = new QueryClient();
	client.setQueryData(["documents", "counts"], { resume: 0, trash: 0 });
	expect(prepareFirstCvCelebration(client)("Sample resume added. Delete it anytime.")).toBe(true);
	expect(add).toHaveBeenCalledExactlyOnceWith({
		type: "celebration",
		description: "Sample resume added. Delete it anytime.",
	});
});
