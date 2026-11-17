import type { DocumentSummary } from "./filter";
import { t } from "@lingui/core/macro";
import { useQuery } from "@tanstack/react-query";
import { useInView } from "motion/react";
import { useMemo, useRef } from "react";
import { Badge } from "@reactive-resume/ui/components/badge";
import { Icon } from "@reactive-resume/ui/components/icon";
import { DocumentThumbnail } from "./resume-thumbnail";
import { applicationCompany } from "@/features/applications/components/application-picker";
import { applicationsListQueryOptions } from "@/features/applications/queries";
import { getStageColor, getStageLabel } from "@/features/applications/stages";
import { letterPageData, letterWordsQueryOptions } from "@/features/letters/compose";
import { usePersonalToolAvailable } from "@/features/personal-tools/availability";
import { orpc } from "@/libs/orpc/client";

function useLetterCardData(document: DocumentSummary, enabled = true) {
	const historyQuery = orpc.coverLetters.listVersions.queryOptions({ input: { id: document.id } });
	const history = useQuery({
		...historyQuery,
		queryKey: [...historyQuery.queryKey, { previewRevision: document.updatedAt.toISOString() }],
		enabled,
	});
	const sentVersion = history.data?.find((item) => item.kind === "sent");
	const query = orpc.coverLetters.getById.queryOptions({ input: { id: document.id } });
	const letter = useQuery({
		...query,
		queryKey: [...query.queryKey, { previewRevision: document.updatedAt.toISOString() }],
		enabled,
	});
	const version = useQuery({
		...orpc.coverLetters.getVersion.queryOptions({
			input: { id: document.id, versionId: sentVersion?.id ?? "" },
		}),
		enabled: enabled && Boolean(sentVersion),
	});
	return {
		...letter,
		data:
			letter.data && history.isSuccess && (!sentVersion || version.data)
				? { ...letter.data, ...version.data?.data }
				: undefined,
		isError: letter.isError || version.isError || history.isError,
		snapshotId: sentVersion?.id,
		history,
		sent: Boolean(sentVersion),
	};
}

/** The letter's own page and language, using the same cached renderer as CV cards. */
export function LetterThumbnail({ document }: { document: DocumentSummary }) {
	const ref = useRef<HTMLDivElement>(null);
	const visible = useInView(ref, { amount: 0.1, margin: "240px" });
	const letter = useLetterCardData(document, visible);
	const words = useQuery({
		...letterWordsQueryOptions(letter.data?.style.metadata.page.locale ?? "ar-SA"),
		enabled: Boolean(letter.data),
	});
	const data = useMemo(
		() => (letter.data && words.data ? letterPageData(letter.data, words.data) : undefined),
		[letter.data, words.data],
	);
	const empty = Boolean(letter.data && !letter.data.content.replace(/<[^>]*>|&nbsp;|\s/gu, ""));
	return (
		<div ref={ref} className="size-full">
			<DocumentThumbnail
				document={{ ...document, id: `${document.id}:${letter.snapshotId ?? "draft"}` }}
				data={data}
				empty={empty}
				failed={letter.isError || words.isError}
				kind="letter"
			/>
		</div>
	);
}

export function LetterCardDetails({ document }: { document: DocumentSummary }) {
	const letter = useLetterCardData(document);
	const { history, sent } = letter;
	const available = usePersonalToolAvailable("applications");
	const jobs = useQuery({ ...applicationsListQueryOptions(), enabled: available });
	const job = jobs.data?.find((item) => item.id === document.application?.id);
	const company = applicationCompany(document.application?.company ?? "");
	const role = applicationCompany(document.application?.role ?? "");
	return (
		<>
			<div data-slot="letter-badges" className="flex flex-wrap items-center gap-1">
				{letter.data && (
					<Badge
						variant="outline"
						aria-label={
							letter.data.style.metadata.page.locale.startsWith("ar")
								? t({ message: "Arabic", context: "letter.card.language" })
								: t({ message: "English", context: "letter.card.language" })
						}
					>
						{new Intl.DisplayNames([letter.data.style.metadata.page.locale], { type: "language" }).of(
							new Intl.Locale(letter.data.style.metadata.page.locale).language,
						)}
					</Badge>
				)}
				{history.isSuccess && (
					<Badge variant="neutral">
						{sent && <Icon name="lock" size={12} />}
						{sent ? t({ message: "Sent", context: "letter.card.status" }) : t`Draft`}
					</Badge>
				)}
			</div>
			<span data-slot="letter-job" className="grid min-w-0 gap-0.5 type-metadata text-ink-2">
				<span dir="auto" className="truncate" title={[role, company].filter(Boolean).join(" · ")}>
					{document.application ? [role, company].filter(Boolean).join(" · ") : t`Not linked`}
				</span>
				{job && (
					<span className="inline-flex items-center gap-1 text-ink-3">
						<span
							data-slot="stage-dot"
							aria-hidden="true"
							className="size-1.5 shrink-0 rounded-full"
							style={{ background: getStageColor(job.status) }}
						/>
						{getStageLabel(job.status)}
					</span>
				)}
			</span>
		</>
	);
}
