import type { NextStep } from "./next-step";
import type { Application } from "./types";
import { isInterview } from "./interviews";

type UpcomingStep = Extract<NextStep, { kind: "interview" | "follow-up" }>;

export function summarizeApplicationGroup(applications: Application[], now = new Date()) {
	let upcoming: UpcomingStep | undefined;
	let updatedAt: Date | undefined;
	const consider = (step: UpcomingStep) => {
		if (step.at >= now && (!upcoming || step.at < upcoming.at)) upcoming = step;
	};
	for (const application of applications) {
		const updated = new Date(application.updatedAt);
		if (!updatedAt || updated > updatedAt) updatedAt = updated;
		if (application.status === "closed") continue;
		for (const interview of application.activity.filter(isInterview)) {
			consider({ kind: "interview", interview, at: new Date(interview.at) });
		}
		if (application.followUpAt) {
			consider({
				kind: "follow-up",
				at: new Date(application.followUpAt),
				note: application.followUpNote ?? "",
				overdue: false,
			});
		}
	}
	return { upcoming, updatedAt };
}
