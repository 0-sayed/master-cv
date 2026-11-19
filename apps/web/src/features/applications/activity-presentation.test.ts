import type { ApplicationTimelineEntry, ApplicationStatus } from "@reactive-resume/schema/applications/data";
import { expect, it } from "vite-plus/test";
import { presentActivity } from "./activity-presentation";
const at = (day: number) => new Date(`2026-11-${String(day).padStart(2, "0")}T12:00:00Z`);
const stage = (id: string, day: number, value: ApplicationStatus): ApplicationTimelineEntry => ({
	id,
	type: "stage",
	at: at(day),
	stage: value,
});
const interview = (id: string, day: number): ApplicationTimelineEntry => ({
	id,
	type: "interview",
	at: at(day),
	kind: "onsite",
	durationMinutes: 60,
	timezone: "Asia/Riyadh",
	notes: "",
	location: "",
	participants: [],
	audience: "other",
});
it("promotes the nearest interview once with stable ordering and no source mutation", () => {
	const source = [
		stage("equal-a", 17, "applied"),
		stage("equal-b", 17, "screening"),
		interview("later", 22),
		interview("soon", 20),
	];
	const before = [...source];
	expect(presentActivity(source, at(18)).map(({ entry }) => entry.id)).toEqual(["soon", "later", "equal-a", "equal-b"]);
	expect(source).toEqual(before);
});
it("preserves repeated stages and derives only proven origins", () => {
	const source = [
		stage("a", 11, "screening"),
		stage("b", 12, "interview"),
		stage("c", 13, "screening"),
		stage("d", 14, "interview"),
	];
	const result = presentActivity(source, at(18));
	expect(result.map(({ entry }) => entry.id)).toEqual(["d", "c", "b", "a"]);
	expect(result.map(({ fromStage }) => fromStage)).toEqual(["screening", "interview", "screening", undefined]);
});
it("omits ambiguous origins for equal timestamps and their successor", () => {
	const source = [
		stage("a", 11, "applied"),
		stage("b", 12, "screening"),
		stage("c", 12, "interview"),
		stage("d", 13, "offer"),
	];
	const result = presentActivity(source, at(18));
	expect(result.find(({ entry }) => entry.id === "b")?.fromStage).toBeUndefined();
	expect(result.find(({ entry }) => entry.id === "c")?.fromStage).toBeUndefined();
	expect(result.find(({ entry }) => entry.id === "d")?.fromStage).toBeUndefined();
});
