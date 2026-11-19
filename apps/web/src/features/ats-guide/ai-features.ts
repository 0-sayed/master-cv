import type { GuideArea } from "./model";
import type { IconName } from "@reactive-resume/ui/components/icon";
import { msg } from "@lingui/core/macro";
import { publicReviewFeatures } from "@reactive-resume/api/features/ai/public-features";

const features = {
	"review.extraction": {
		icon: "file-arrow-up",
		area: "layout",
		anchor: 13,
		name: msg({ message: "CV import assistance", context: "reviewGuide.ai.extraction.name" }),
		description: msg({
			message: "Review uncertain imported text and approve each proposed field.",
			context: "reviewGuide.ai.extraction.description",
		}),
		location: msg({
			message: "My documents → Import CV → Get help with uncertain text",
			context: "reviewGuide.ai.extraction.location",
		}),
	},
	"review.questions": {
		icon: "question",
		area: "content",
		anchor: 212,
		name: msg({ message: "Follow-up questions", context: "reviewGuide.ai.questions.name" }),
		description: msg({
			message: "Answer questions about missing facts before improving your wording.",
			context: "reviewGuide.ai.questions.description",
		}),
		location: msg({
			message: "My documents → CV → Review → AI → Wording",
			context: "reviewGuide.ai.questions.location",
		}),
	},
	"review.summary": {
		icon: "user",
		area: "parseability",
		anchor: 132,
		name: msg({ message: "Professional summary", context: "reviewGuide.ai.summary.name" }),
		description: msg({
			message: "Draft a summary from facts you select.",
			context: "reviewGuide.ai.summary.description",
		}),
		location: msg({ message: "My documents → CV → Write → Summary", context: "reviewGuide.ai.summary.location" }),
	},
	"review.wording": {
		icon: "pencil-line",
		area: "content",
		anchor: 196,
		name: msg({ message: "Wording", context: "reviewGuide.ai.wording.name" }),
		description: msg({
			message: "Improve wording while keeping your facts.",
			context: "reviewGuide.ai.wording.description",
		}),
		location: msg({ message: "My documents → CV → Review → AI", context: "reviewGuide.ai.wording.location" }),
	},
	"review.tailoring": {
		icon: "target",
		area: "content",
		anchor: 220,
		name: msg({ message: "Job tailoring", context: "reviewGuide.ai.tailoring.name" }),
		description: msg({
			message: "Adapt a CV to a job using your evidence.",
			context: "reviewGuide.ai.tailoring.description",
		}),
		location: msg({ message: "My documents → CV → Job comparison", context: "reviewGuide.ai.tailoring.location" }),
	},
	"review.translation": {
		icon: "translate",
		area: "layout",
		anchor: 172,
		name: msg({ message: "Translation", context: "reviewGuide.ai.translation.name" }),
		description: msg({
			message: "Create a separate version in another language.",
			context: "reviewGuide.ai.translation.description",
		}),
		location: msg({ message: "My documents → CV → Language versions", context: "reviewGuide.ai.translation.location" }),
	},
	"review.job-evidence": {
		icon: "briefcase",
		area: "content",
		anchor: 205,
		name: msg({ message: "Job evidence", context: "reviewGuide.ai.evidence.name" }),
		description: msg({
			message: "Compare job requirements with your saved facts.",
			context: "reviewGuide.ai.evidence.description",
		}),
		location: msg({ message: "My documents → CV → Job comparison", context: "reviewGuide.ai.evidence.location" }),
	},
	"review.cover-letter": {
		icon: "envelope",
		area: "layout",
		anchor: 245,
		name: msg({ message: "Cover letter", context: "reviewGuide.ai.letter.name" }),
		description: msg({
			message: "Draft a letter from your CV and the job.",
			context: "reviewGuide.ai.letter.description",
		}),
		location: msg({
			message: "My documents → CV → Job comparison → Letter",
			context: "reviewGuide.ai.letter.location",
		}),
	},
	"review.interview-prep": {
		icon: "chat",
		area: "layout",
		anchor: 300,
		name: msg({ message: "Interview preparation", context: "reviewGuide.ai.interview.name" }),
		description: msg({
			message: "Prepare questions and answers grounded in your experience.",
			context: "reviewGuide.ai.interview.description",
		}),
		location: msg({
			message: "Not available in the local launcher. Interview preparation remains benchmark-only.",
			context: "reviewGuide.ai.interview.location",
		}),
	},
} as const satisfies Record<
	(typeof publicReviewFeatures)[number],
	{
		icon: IconName;
		area: GuideArea;
		anchor: number;
		name: ReturnType<typeof msg>;
		description: ReturnType<typeof msg>;
		location: ReturnType<typeof msg>;
	}
>;

// The public writer configuration controls membership. Geometry controls reading order.
export const AI_GUIDE_FEATURES = publicReviewFeatures
	.map((id) => ({ id, ...features[id] }))
	.sort((a, b) => a.anchor - b.anchor);

export const aiGuideCopy = {
	title: msg({ message: "AI tools for your CV", context: "reviewGuide.ai.title" }),
	consent: msg({ message: "Nothing is sent without your consent", context: "reviewGuide.ai.consent" }),
	approval: msg({ message: "You approve every change", context: "reviewGuide.ai.approval" }),
	local: msg({ message: "ATS and data checks never use AI", context: "reviewGuide.ai.local" }),
};
