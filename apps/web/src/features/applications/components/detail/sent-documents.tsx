import type { Application } from "../../types";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Alert, AlertTitle, AlertDescription, AlertActions } from "@reactive-resume/ui/components/alert";
import { Badge } from "@reactive-resume/ui/components/badge";
import { Button, buttonVariants } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { SectionCard, SectionCardTitle } from "@reactive-resume/ui/components/section-card";
import { DocumentManager } from "./document-manager";
import { QuerySkeleton } from "@/components/query-skeleton";
import { formatInterfaceDate } from "@/libs/locale";
import { client, orpc } from "@/libs/orpc/client";

export function SentDocuments({ application, disabled }: { application: Application; disabled: boolean }) {
	const [open, setOpen] = useState(false);
	return (
		<SectionCard aria-labelledby="application-sent">
			<SectionCardTitle as="h2" id="application-sent" tabIndex={-1} className="scroll-mt-(--app-toolbar-height)">
				<Trans>Documents</Trans>
			</SectionCardTitle>
			<DocumentRow application={application} kind="resume" />
			<DocumentRow application={application} kind="letter" />
			{[
				{ url: application.resumeFileUrl, name: application.resumeFileName },
				{ url: application.coverLetterUrl, name: application.coverLetterName },
			]
				.filter((file) => file.url)
				.map((file) => (
					<div key={file.url} className="grid gap-1 border-t border-line-1 pt-3">
						<span className="type-label">
							<Trans>Attachment</Trans>
						</span>
						<a
							href={file.url ?? undefined}
							target="_blank"
							rel="noreferrer"
							dir="auto"
							className="type-body wrap-anywhere text-accent-text underline"
						>
							{file.name || t`PDF attachment`}
						</a>
						<span className="type-metadata text-ink-2">
							<Trans>Linked, not recorded as sent</Trans>
						</span>
					</div>
				))}
			<Button variant="secondary" disabled={disabled} onClick={() => setOpen(true)}>
				<Trans>Manage documents</Trans>
			</Button>
			<DocumentManager application={application} disabled={disabled} open={open} onOpenChange={setOpen} />
		</SectionCard>
	);
}

function DocumentRow({ application, kind }: { application: Application; kind: "resume" | "letter" }) {
	const { i18n } = useLingui();
	const resume = kind === "resume";
	const id = resume ? application.resumeId : application.coverLetterId;
	const versionId = resume ? application.sentResumeVersionId : application.sentCoverLetterVersionId;
	const documents = useQuery(orpc.documents.list.queryOptions({ input: { trashed: false } }));
	const document = documents.data?.find((entry) => entry.id === id && entry.type === kind);
	const snapshot = useQuery({
		queryKey: ["application-sent-version", kind, id, versionId],
		enabled: Boolean(id && versionId),
		queryFn: async () => {
			if (!id || !versionId) throw new Error("Missing sent version reference");
			if (resume) {
				const value = await client.resume.getVersion({ resumeId: id, versionId });
				return { name: value.name, createdAt: value.createdAt };
			}
			const value = await client.coverLetters.getVersion({ id, versionId });
			return { name: value.data.name || value.name, createdAt: value.createdAt };
		},
	});
	const failed =
		documents.isError || Boolean(versionId && snapshot.isError) || Boolean(id && documents.isSuccess && !document);
	const loading = Boolean(id && (documents.isPending || (versionId && snapshot.isPending)));
	const sentAt = snapshot.data?.createdAt ?? (resume ? application.sentResumeRecordedAt : null);
	return (
		<article className="flex min-w-0 items-start gap-3 border-b border-line-1 pb-4">
			<span
				aria-hidden="true"
				className={
					resume
						? "document-icon-tile bg-accent-soft text-accent-text"
						: "document-icon-tile bg-info-soft text-info-text"
				}
			>
				<Icon name={resume ? "file-text" : "envelope-simple"} />
			</span>
			<div className="grid min-w-0 flex-1 gap-2">
				<h3 className="type-metadata text-ink-3">{resume ? <Trans>CV</Trans> : <Trans>Cover letter</Trans>}</h3>
				{!id ? (
					<p className="type-body text-ink-2">
						{resume ? <Trans>No CV linked</Trans> : <Trans>No cover letter linked</Trans>}
					</p>
				) : loading ? (
					<QuerySkeleton count={1} label={<Trans>Loading document…</Trans>} />
				) : failed ? (
					<Alert variant="error">
						<Icon name="warning" />
						<AlertTitle>
							<Trans>Document unavailable</Trans>
						</AlertTitle>
						<AlertDescription>
							<Trans>The document or its recorded version could not load. Your reference remains unchanged.</Trans>
						</AlertDescription>
						<AlertActions>
							<Button
								variant="secondary"
								onClick={() => {
									void documents.refetch();
									if (versionId) void snapshot.refetch();
								}}
							>
								<Trans>Retry</Trans>
							</Button>
						</AlertActions>
					</Alert>
				) : (
					<>
						<p dir="auto" className="type-label wrap-anywhere">
							{snapshot.data?.name || document?.name}
						</p>
						{versionId ? (
							<>
								<div className="flex flex-wrap items-center gap-2">
									<Badge variant="accent">
										<Trans>Sent</Trans>
									</Badge>
									<span className="type-metadata text-ink-2">
										{sentAt ? (
											formatInterfaceDate(sentAt, i18n.locale, { year: "numeric", month: "short", day: "numeric" })
										) : (
											<Trans>Sent date not recorded</Trans>
										)}
									</span>
								</div>
							</>
						) : (
							<span className="type-metadata text-ink-2">
								<Trans>Linked, not recorded as sent</Trans>
							</span>
						)}
						{resume ? (
							<Link
								to="/builder/$resumeId"
								params={{ resumeId: id }}
								search={versionId ? { version: versionId } : {}}
								className={buttonVariants({ variant: "secondary", size: "row", className: "justify-self-start" })}
							>
								<Icon name="arrow-square-out" />
								{versionId ? <Trans>Open sent version</Trans> : <Trans>Open current CV</Trans>}
							</Link>
						) : (
							<Link
								to="/builder/letter/$coverLetterId"
								params={{ coverLetterId: id }}
								search={versionId ? { version: versionId } : {}}
								className={buttonVariants({ variant: "secondary", size: "row", className: "justify-self-start" })}
							>
								<Icon name="arrow-square-out" />
								{versionId ? <Trans>Open sent version</Trans> : <Trans>Open current letter</Trans>}
							</Link>
						)}
					</>
				)}
			</div>
		</article>
	);
}
