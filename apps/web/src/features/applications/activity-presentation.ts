import type { ApplicationStatus, ApplicationTimelineEntry } from "@reactive-resume/schema/applications/data";

export type PresentedActivity = { entry: ApplicationTimelineEntry; upcoming: boolean; fromStage?: ApplicationStatus };

export function presentActivity(activity: ApplicationTimelineEntry[], now: Date): PresentedActivity[] {
	const time = (entry: ApplicationTimelineEntry) => new Date(entry.at).getTime();
	const stages = activity.filter((entry) => entry.type === "stage");
	const upcoming = activity
		.filter((entry) => entry.type === "interview" && time(entry) + entry.durationMinutes * 60000 >= now.getTime())
		.sort((a, b) => time(a) - time(b))[0];
	const sorted = [...activity].sort((a, b) => time(b) - time(a));
	if (upcoming) sorted.splice(sorted.indexOf(upcoming), 1);
	return (upcoming ? [upcoming, ...sorted] : sorted).map((entry) => {
		const result: PresentedActivity = { entry, upcoming: entry === upcoming };
		if (entry.type !== "stage" || stages.filter((stage) => time(stage) === time(entry)).length !== 1) return result;
		const previous = stages.filter((stage) => time(stage) < time(entry)).sort((a, b) => time(b) - time(a));
		if (previous[0]?.type === "stage" && (!previous[1] || time(previous[0]) !== time(previous[1])))
			result.fromStage = previous[0].stage;
		return result;
	});
}
