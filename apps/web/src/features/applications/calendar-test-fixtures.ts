import type { Application } from "./types";
import { collectInterviews } from "./interviews";
const calendarApplication: Application = {
	id: "application",
	company: "Example Co",
	role: "Engineer",
	status: "interview",
	closedReason: null,
	coverLetterId: null,
	selectedResumeVersionId: null,
	sentResumeRecordedAt: null,
	sentResumeVersionId: null,
	sentCoverLetterVersionId: null,
	sentCheckScore: null,
	requirements: [],
	location: null,
	salary: null,
	source: null,
	sourceUrl: null,
	notes: null,
	tags: [],
	contacts: [],
	activity: [],
	appliedAt: new Date(),
	createdAt: new Date(),
	updatedAt: new Date(),
	resumeId: null,
	jobDescription: null,
	postingSource: null,
	matchScore: null,
	aiMetadata: null,
	resumeFileUrl: null,
	resumeFileName: null,
	coverLetterUrl: null,
	coverLetterName: null,
	followUpAt: null,
	followUpNote: null,
};

export function calendarItems(count = 7) {
	return collectInterviews(
		Array.from({ length: count }, (_, i) => ({
			...calendarApplication,
			id: `application-${i}`,
			company: `Example ${i}`,
			role: "مهندس Platform",
			activity: [
				{
					id: `round-${i}`,
					type: "interview" as const,
					at: new Date(`2026-11-${String(18 + Math.floor(i / 2)).padStart(2, "0")}T10:00:00Z`),
					kind: "technical" as const,
					durationMinutes: 60,
					location: "https://example.test/meet",
					notes: "Prepare",
					participants: [],
					audience: "hiring-manager" as const,
					timezone: "Asia/Riyadh",
				},
			],
		})),
	);
}
