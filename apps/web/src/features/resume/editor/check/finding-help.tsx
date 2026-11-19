import type { FixChange } from "./fix-preview";
import type { GuideCode } from "@/features/ats-guide/model";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { t } from "@lingui/core/macro";
import { RuleDetail } from "@reactive-resume/ui/components/rule-detail";
import { ReviewDiff } from "./review-diff";

export function FindingHelp({
	why,
	proposal,
	data,
}: {
	code: GuideCode;
	why: string;
	documentLocale: string;
	proposal?: FixChange | undefined;
	data: ResumeData;
}) {
	return (
		<RuleDetail
			compact
			why={why}
			comparison={proposal ? <ReviewDiff change={proposal} before={data} /> : null}
			labels={{
				why: t`Why it matters`,
				before: t`Before`,
				after: t`After`,
				showMore: t`Show more`,
				showLess: t`Show less`,
			}}
		/>
	);
}
