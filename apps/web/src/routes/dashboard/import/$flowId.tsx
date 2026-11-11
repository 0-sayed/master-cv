import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertTitle, AlertDescription } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { useNewDocumentsStore } from "@/features/documents/new-documents";
import { ImportReview } from "@/features/resume/import/review";
import {
	readReviewDraft,
	removeReviewDraft,
	saveReviewDraft,
	type ReviewDraft,
	type ReviewState,
} from "@/features/resume/import/review-draft";
import { orpc } from "@/libs/orpc/client";
import { formatPageTitle } from "@/libs/route-titles";

export const Route = createFileRoute("/dashboard/import/$flowId")({
	loader: ({ params, context }) => readReviewDraft({ ownerId: context.session.user.id, flowId: params.flowId }),
	component: ReviewPage,
	head: () => ({
		meta: [{ title: formatPageTitle(t({ context: "review.import.title", message: "Review imported information" })) }],
	}),
});

function ReviewPage() {
	const draft = Route.useLoaderData();
	const { session } = Route.useRouteContext();
	const { flowId } = Route.useParams();
	// Guard cached loader data as well as the IndexedDB lookup when the authenticated owner changes.
	const scopedDraft = draft?.ownerId === session.user.id && draft.flowId === flowId ? draft : null;
	return (
		<ReviewSession key={`${session.user.id}:${flowId}:${scopedDraft?.expiresAt ?? "missing"}`} draft={scopedDraft} />
	);
}

function ReviewSession({ draft }: { draft: ReviewDraft | null }) {
	const { session, queryClient } = Route.useRouteContext();
	const { flowId } = Route.useParams();
	const navigate = Route.useNavigate();
	const queue = useRef<Promise<void>>(Promise.resolve());
	const current = useRef(draft);
	const closed = useRef(false);
	const mounted = useRef(true);
	const completedResume = useRef<string | undefined>(undefined);
	const [error, setError] = useState(false);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	const checkpoint = useCallback((state: ReviewState) => {
		if (!current.current || closed.current) return Promise.reject(new Error("Import review closed"));
		const next = { ...current.current, state };
		current.current = next;
		const pending = queue.current.catch(() => {}).then(() => saveReviewDraft(next));
		queue.current = pending;
		return pending;
	}, []);
	const leave = async (resumeId?: string) => {
		completedResume.current ??= resumeId;
		const destination = completedResume.current;
		closed.current = true;
		try {
			await queue.current.catch(() => {});
			await removeReviewDraft({ ownerId: session.user.id, flowId });
			if (!mounted.current) return;
			if (destination) {
				void queryClient.invalidateQueries({ queryKey: orpc.documents.key() });
				useNewDocumentsStore.getState().markNew(destination);
				void navigate({
					to: "/builder/$resumeId",
					params: { resumeId: destination },
					search: { mode: "write" },
					replace: true,
				});
			} else void navigate({ to: "/dashboard", replace: true });
		} catch {
			closed.current = false;
			if (mounted.current) setError(true);
		}
	};
	return (
		<>
			{error && (
				<Alert variant="error">
					<Icon name="warning-circle" />
					<AlertTitle>
						<Trans>Something went wrong</Trans>
					</AlertTitle>
					<AlertDescription>
						<Trans>Could not close this review. Try again.</Trans>
						<Button variant="secondary" onClick={() => void leave()}>
							<Trans>Retry</Trans>
						</Button>
					</AlertDescription>
				</Alert>
			)}
			{draft ? (
				<ImportReview
					key={`${session.user.id}:${flowId}`}
					initial={draft.initial}
					state={draft.state}
					flowId={flowId}
					file={draft.file}
					sourceName={draft.file.name}
					pages={draft.pages}
					partial={draft.partial}
					issues={draft.issues}
					onCheckpoint={checkpoint}
					onBack={() => void leave()}
					onSaved={(id) => void leave(id)}
				/>
			) : (
				<Alert variant="warn">
					<Icon name="warning-circle" />
					<AlertTitle>
						<Trans context="review.import.title">Review imported information</Trans>
					</AlertTitle>
					<AlertDescription>
						<Trans>This import review has expired or is unavailable on this device. Choose your file again.</Trans>
						<Button variant="secondary" onClick={() => void leave()}>
							<Trans>Back to documents</Trans>
						</Button>
					</AlertDescription>
				</Alert>
			)}
		</>
	);
}
