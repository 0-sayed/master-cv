import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Badge } from "@reactive-resume/ui/components/badge";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { AI_GUIDE_FEATURES, aiGuideCopy } from "./ai-features";
import { CvFeatureMap } from "./area-map";
import { guideCopy } from "./copy";
import { QuerySkeleton } from "@/components/query-skeleton";
import { useAssistantCopy } from "@/features/assistant/copy.generated";
import { orpc } from "@/libs/orpc/client";

export function AiGuideMap() {
	const { _, i18n } = useLingui();
	const copy = useAssistantCopy();
	const availability = useQuery(orpc.ai.availability.queryOptions());
	const nodes = useMemo(
		() =>
			AI_GUIDE_FEATURES.map((feature) => ({
				...feature,
				name: _(feature.name),
				description: _(feature.description),
				location:
					feature.id === "review.interview-prep"
						? i18n.locale.startsWith("ar")
							? "غير متاح محليًا"
							: "Not available locally"
						: _(feature.location),
				...(feature.id === "review.interview-prep" ? { locationNote: _(feature.location) } : {}),
				href: "/dashboard",
			})),
		[_, i18n.locale],
	);
	return (
		<div className="grid gap-4">
			<div
				id="review-guide-description"
				className="flex flex-wrap items-center justify-center gap-2 text-center type-body text-ink-2"
			>
				<span>{_(guideCopy.aiDescription)}</span>
				{availability.isPending ? (
					<QuerySkeleton count={1} label={<Trans>Loading assistant availability…</Trans>} />
				) : availability.error || availability.data.state === "unavailable" ? (
					<div role="status" className="flex flex-wrap items-center gap-2 type-metadata text-ink-2">
						{copy("review.assistant.error.unavailableTitle")}
						<Button
							variant="secondary"
							onClick={() => {
								void availability.refetch();
							}}
						>
							<Trans>Try again</Trans>
						</Button>
					</div>
				) : availability.data.state === "not_enabled" ? (
					<Badge role="status" variant="outline">
						{copy("review.assistant.status.disabled")}
					</Badge>
				) : null}
			</div>
			<CvFeatureMap nodes={nodes} title={_(aiGuideCopy.title)} />
			<ul className="flex flex-wrap gap-x-6 gap-y-3 type-metadata text-ink-2">
				{(
					[
						["shield-check", aiGuideCopy.consent],
						["check", aiGuideCopy.approval],
						["database", aiGuideCopy.local],
					] as const
				).map(([icon, label]) => (
					<li key={icon} className="flex items-center gap-2">
						<Icon name={icon} />
						{_(label)}
					</li>
				))}
			</ul>
		</div>
	);
}
