import { describe, expect, it } from "vite-plus/test";
import { reviewGuideSearch } from "./links";

describe("review guide search", () => {
	it("accepts an internal builder return path", () => {
		expect(reviewGuideSearch({ returnTo: "/builder/resume-1" }).returnTo).toBe("/builder/resume-1");
		expect(reviewGuideSearch({ returnTo: "/builder/resume-1?mode=check" }).returnTo).toBe(
			"/builder/resume-1?mode=check",
		);
	});

	it.each(["https://example.com", "//example.com", "/dashboard", "/builderx/resume-1", "/builder/\\\\example.com"])(
		"rejects an unsafe return path: %s",
		(returnTo) => expect(reviewGuideSearch({ returnTo }).returnTo).toBeUndefined(),
	);
});
