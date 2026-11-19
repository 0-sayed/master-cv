import type { CareerMaster } from "@reactive-resume/schema/career-master";
import { t } from "@lingui/core/macro";
import { careerCompleteness, type CompletenessPart } from "@reactive-resume/schema/career-completeness";
import { ProgressRing } from "@reactive-resume/ui/components/progress-ring";

export function CareerCompleteness({ master }: { master: CareerMaster }) {
	const { percentage, next } = careerCompleteness(master);
	const labels: Record<CompletenessPart, string> = {
		contact: t`contact details`,
		summary: t`a summary`,
		experience: t`an experience with a description`,
		education: t`education`,
		skills: t`skills`,
		languages: t`languages`,
	};
	const part = next ? labels[next.part] : "";
	const target = next?.target ?? 100;
	return (
		<div className="flex items-center gap-3">
			<ProgressRing value={percentage} label={t`Career record completeness`} />
			{next && (
				<a
					className="type-body text-accent-text underline-offset-4 hover:underline focus-visible:underline"
					href={`#career-heading-${next.part}`}
				>{t`Add ${part} to reach ${target}%`}</a>
			)}
		</div>
	);
}
