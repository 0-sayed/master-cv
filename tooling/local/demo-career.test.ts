import { afterEach, expect, it, vi } from "vite-plus/test";
import { createDemoApplications } from "./demo-career";

const now = new Date("2026-11-18T09:00:00Z");
afterEach(() => vi.unstubAllEnvs());
it("matches approved insight distributions", () => {
	const rows = createDemoApplications(now);
	expect(rows).toHaveLength(20);
	expect(
		Object.fromEntries(
			["saved", "applied", "screening", "interview", "offer", "closed"].map((status) => [
				status,
				rows.filter((row) => row.input.status === status).length,
			]),
		),
	).toEqual({ saved: 2, applied: 6, screening: 3, interview: 2, offer: 1, closed: 6 });
	const sent = rows.filter((row) => row.input.status !== "saved");
	const reply = (row: (typeof rows)[number]) =>
		row.history.find(
			(event) =>
				["screening", "interview", "offer"].includes(event.stage) ||
				(event.stage === "closed" && row.input.closedReason === "not-selected"),
		);
	expect(sent.filter(reply)).toHaveLength(11);
	expect(sent.filter((row) => row.resumeGroup === "tailored")).toHaveLength(11);
	expect(sent.filter((row) => row.resumeGroup === "tailored" && reply(row))).toHaveLength(8);
	expect(sent.filter((row) => row.resumeGroup === "base" && reply(row))).toHaveLength(3);
	expect(sent.filter((row) => row.resumeGroup === "unlinked")).toHaveLength(2);
	expect(
		sent
			.flatMap((row) => {
				const at = reply(row)?.at;
				const applied = row.history.find((event) => event.stage === "applied")?.at;
				return at && applied ? [(at.getTime() - applied.getTime()) / 86400000] : [];
			})
			.sort((a, b) => a - b),
	).toEqual([2, 3, 4, 4, 5, 6, 6, 7, 8, 10, 12]);
	expect(
		["applied", "screening", "interview", "offer"].map(
			(stage) => sent.filter((row) => row.history.some((event) => event.stage === stage)).length,
		),
	).toEqual([18, 10, 6, 2]);
	expect(
		[...new Set(rows.map((row) => row.input.source))]
			.map((source) => rows.filter((row) => row.input.source === source).length)
			.sort((a, b) => b - a),
	).toEqual([7, 4, 3, 3, 1, 1, 1]);
});

it("anchors history to injected Riyadh weeks", () => {
	vi.stubEnv("TZ", "Pacific/Honolulu");
	for (const clock of [now, new Date("2027-02-06T21:00:00Z")]) {
		const rows = createDemoApplications(clock);
		expect(rows.every((row) => row.history.every((event) => event.at <= clock))).toBe(true);
		expect(
			rows.every((row) =>
				row.history.every(
					(event, index) => index === 0 || event.at.getTime() >= (row.history[index - 1]?.at.getTime() ?? 0),
				),
			),
		).toBe(true);
		const current = new Date(clock.getTime() + 10800000);
		const weekStart =
			Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() - current.getUTCDay()) - 10800000;
		expect(
			Array.from(
				{ length: 8 },
				(_, index) =>
					rows.filter((row) =>
						row.history.some(
							(event) =>
								event.stage === "applied" &&
								Math.floor((event.at.getTime() - (weekStart - 49 * 86400000)) / (7 * 86400000)) === index,
						),
					).length,
			),
		).toEqual([1, 2, 1, 3, 2, 4, 3, 2]);
	}
});

it("does not invent saved-job progress", () => {
	const saved = createDemoApplications(now).filter((row) => row.input.status === "saved");
	expect(saved).toHaveLength(2);
	expect(
		saved.every(
			(row) =>
				row.history.every((event) => event.stage === "saved") &&
				row.resumeGroup === "base" &&
				row.interviews.length === 0,
		),
	).toBe(true);
});

it.each(["2026-11-18T09:00:00Z", "2026-11-19T20:30:00Z"])(
	"provides ten upcoming interviews across Riyadh date buckets from %s",
	(value) => {
		vi.stubEnv("TZ", "Pacific/Honolulu");
		const clock = new Date(value);
		const rows = createDemoApplications(clock);
		const upcoming = rows.flatMap((row) =>
			row.interviews.filter((event) => event.at > clock).map((event) => ({ row, event })),
		);
		expect(upcoming).toHaveLength(10);
		const date = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(at);
		const tomorrow = value.startsWith("2026-11-18") ? "2026-11-19" : "2026-11-20";
		expect(upcoming.filter(({ event }) => date(event.at) === tomorrow)).toHaveLength(4);
		expect(upcoming.filter(({ event }) => date(event.at) === "2026-11-21")).toHaveLength(2);
		expect(
			upcoming.filter(({ event }) => date(event.at) >= "2026-11-22" && date(event.at) <= "2026-11-28"),
		).toHaveLength(2);
		expect(upcoming.filter(({ event }) => date(event.at).startsWith("2026-12"))).toHaveLength(2);
		expect(
			upcoming
				.filter(({ event }) => date(event.at) === tomorrow)
				.map(({ event }) => (event.at.getUTCHours() + 3) % 24)
				.sort((a, b) => a - b),
		).toEqual([9, 12, 16, 18]);
		expect(new Set(upcoming.map(({ event }) => event.kind))).toEqual(
			new Set(["screening", "technical", "behavioral", "onsite", "other"]),
		);
		for (const { row, event } of upcoming) {
			expect(["screening", "interview"]).toContain(row.input.status);
			expect(row.history.every((entry) => entry.at <= clock && entry.at < event.at)).toBe(true);
			expect(event.durationMinutes).toBeGreaterThan(0);
		}
		const titles = upcoming.map(({ row }) => row.input.role);
		expect(titles.some((title) => /[\u0600-\u06ff]/.test(title))).toBe(true);
		expect(titles.some((title) => /^[A-Za-z]/.test(title))).toBe(true);
		expect(titles.some((title) => title.length > 100)).toBe(true);
		expect(rows.flatMap((row) => row.interviews).filter((event) => event.at <= clock)).toHaveLength(6);
	},
);

it.each(["2026-12-31T20:59:00Z", "2027-02-06T21:00:00Z", "2028-02-29T20:59:00Z"])(
	"keeps appointments in the future across calendar boundaries from %s",
	(value) => {
		const clock = new Date(value);
		const rows = createDemoApplications(clock);
		expect(rows.flatMap((row) => row.interviews).filter((event) => event.at > clock)).toHaveLength(10);
		expect(rows.every((row) => row.history.every((event) => event.at <= clock))).toBe(true);
	},
);
