import type { SaveJobTargetInput } from "@reactive-resume/schema/job-evidence";
import { Trans } from "@lingui/react/macro";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { Input } from "@reactive-resume/ui/components/input";
import { Label } from "@reactive-resume/ui/components/label";
import { NativeSelect } from "@reactive-resume/ui/components/native-select";
import { SectionCard } from "@reactive-resume/ui/components/section-card";
import { Textarea } from "@reactive-resume/ui/components/textarea";
import { JobEvidencePage } from "./job-evidence-page";
import { PageHeader } from "@/components/layout/page-header";
import { QuerySkeleton } from "@/components/query-skeleton";
import { ReviewNotice } from "@/features/resume/editor/proposals/review-operation";
import { useVariantsCopy } from "@/features/resume/variants/copy.generated";
import { client, orpc } from "@/libs/orpc/client";

export function JobTargetForm({
	sourceName,
	initial,
	pending,
	onCompare,
	onCancel,
}: {
	sourceName: string;
	initial: Pick<SaveJobTargetInput, "role" | "employer" | "text"> | null;
	pending: boolean;
	onCompare: (input: Pick<SaveJobTargetInput, "role" | "employer" | "text">) => void;
	onCancel: () => void;
}) {
	const copy = useVariantsCopy();
	const id = useId();
	const [role, setRole] = useState(initial?.role ?? "");
	const [employer, setEmployer] = useState(initial?.employer ?? "");
	const [text, setText] = useState(initial?.text ?? "");
	return (
		<SectionCard>
			<h2 className="type-section">{copy("jobs.tailoring.formTitle")}</h2>
			<p className="type-body text-ink-2">{copy("jobs.tailoring.formHint")}</p>
			<form
				className="grid gap-4"
				onSubmit={(event) => {
					event.preventDefault();
					if (role.trim() && text.trim()) onCompare({ role, employer, text });
				}}
			>
				<Label htmlFor={`${id}-role`}>
					<Trans>Job title</Trans>
				</Label>
				<Input
					id={`${id}-role`}
					dir="auto"
					required
					maxLength={200}
					value={role}
					onChange={(event) => setRole(event.target.value)}
				/>
				<Label htmlFor={`${id}-employer`}>
					<Trans>Employer (optional)</Trans>
				</Label>
				<Input
					id={`${id}-employer`}
					dir="auto"
					maxLength={200}
					value={employer}
					onChange={(event) => setEmployer(event.target.value)}
				/>
				<Label htmlFor={`${id}-ad`}>
					<Trans>Job ad</Trans>
				</Label>
				<Textarea
					id={`${id}-ad`}
					dir="auto"
					required
					maxLength={32000}
					value={text}
					onChange={(event) => setText(event.target.value)}
				/>
				<p className="type-body">
					{copy("jobs.baseCv.label")}: <bdi dir="auto">{sourceName}</bdi>
				</p>
				<p className="type-body text-ink-2">{copy("jobs.tailoring.askAboutGaps")}</p>
				<div className="flex flex-wrap gap-2">
					<Button type="submit" disabled={pending || !role.trim() || !text.trim()}>
						<Trans>Compare</Trans>
					</Button>
					<Button variant="secondary" disabled={pending} onClick={onCancel}>
						<Trans>Cancel</Trans>
					</Button>
				</div>
			</form>
		</SectionCard>
	);
}
export function JobTargetPage({ resumeId }: { resumeId: string }) {
	const copy = useVariantsCopy();
	const navigate = useNavigate();
	const cv = useQuery(orpc.resume.getById.queryOptions({ input: { id: resumeId } }));
	const documents = useQuery(orpc.resume.list.queryOptions({ input: {} }));
	const evidence = useQuery(orpc.career.jobTargets.evidence.queryOptions({ input: { resumeId } }));
	const [editing, setEditing] = useState(false);
	const save = useMutation({
		mutationFn: async (input: Pick<SaveJobTargetInput, "role" | "employer" | "text">) => {
			if (!cv.data) throw new Error("SOURCE_UNAVAILABLE");
			const selected = evidence.data?.selection;
			const job = await client.career.jobTargets.save({
				...input,
				...(selected ? { jobId: selected.jobId, expectedRevision: selected.jobRevision } : {}),
			});
			await client.career.jobTargets.select({
				resumeId,
				expectedUpdatedAt: cv.data.updatedAt.toISOString(),
				jobId: job.jobId,
				jobRevision: job.revision,
				expectedSelectionRevision: selected?.revision ?? null,
			});
		},
		onSuccess: async () => {
			await evidence.refetch();
			setEditing(false);
		},
	});
	return (
		<>
			<PageHeader
				title={copy("jobs.tailoring.title.compact")}
				description={copy("jobs.comparison.resultHint")}
				back={
					<Link to="/dashboard">
						<Trans>My documents</Trans>
					</Link>
				}
			/>
			{cv.isPending || evidence.isPending ? (
				<QuerySkeleton shape="rows" />
			) : cv.error || evidence.error ? (
				<ReviewNotice
					retry={() => {
						void cv.refetch();
						void evidence.refetch();
					}}
				>
					<Trans>Could not load this CV and job. Retry.</Trans>
				</ReviewNotice>
			) : cv.data ? (
				<>
					<Label htmlFor="job-source">{copy("jobs.baseCv.label")}</Label>
					<NativeSelect
						id="job-source"
						value={resumeId}
						onChange={(event) =>
							void navigate({ to: "/dashboard/resumes/$resumeId/job", params: { resumeId: event.target.value } })
						}
					>
						{(documents.data ?? [cv.data]).map((document) => (
							<option key={document.id} value={document.id}>
								{document.name}
							</option>
						))}
					</NativeSelect>
					{save.error && (
						<ReviewNotice retry={() => save.reset()}>
							<Trans>Could not save the comparison. Your paste is kept. Reload the source if it changed.</Trans>
						</ReviewNotice>
					)}
					{!evidence.data?.selection || editing ? (
						<JobTargetForm
							key={resumeId}
							sourceName={cv.data.name}
							initial={evidence.data?.job ?? null}
							pending={save.isPending}
							onCompare={(input) => save.mutate(input)}
							onCancel={() => {
								if (evidence.data?.selection) setEditing(false);
								else void navigate({ to: "/dashboard" });
							}}
						/>
					) : (
						<JobEvidencePage
							resumeId={resumeId}
							data={evidence.data}
							onChange={() => setEditing(true)}
							onRefresh={() => void evidence.refetch()}
						/>
					)}
				</>
			) : null}
		</>
	);
}
