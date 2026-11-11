import { expect, it } from "vite-plus/test";
import { formatTimeSince } from "./format";

it("uses natural Arabic plurals, Latin digits and a wrappable phrase for last-view times", () => {
	const now = new Date("2026-11-10T14:00:00Z").getTime();
	expect(formatTimeSince(new Date(now - 3 * 3_600_000), "ar-SA", now)).toBe("قبل 3 ساعات");
	expect(formatTimeSince(new Date(now - 2 * 3_600_000), "ar-SA", now)).toBe("قبل ساعتين");
});
