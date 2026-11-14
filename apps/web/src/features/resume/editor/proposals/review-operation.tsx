import type { OperationRequest, SourceRevision } from "@reactive-resume/schema/ai-operation";
import type { ReactNode } from "react";
import { Trans } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Alert, AlertTitle, AlertDescription, AlertActions } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@reactive-resume/ui/components/dialog";
import { Icon } from "@reactive-resume/ui/components/icon";
import { QuerySkeleton } from "@/components/query-skeleton";
import { useAssistantCopy } from "@/features/assistant/copy.generated";
import { assistantAvailability } from "@/features/assistant/operation-state";
import { client, orpc } from "@/libs/orpc/client";

export function ReviewNotice({ children, retry }: { children: ReactNode; retry?: (() => void) | undefined }) {
	return (
		<Alert variant="warn">
			<Icon name="warning-circle" />
			<AlertTitle>{children}</AlertTitle>

			<AlertActions>
				{retry && (
					<Button variant="secondary" onClick={retry}>
						<Trans>Retry</Trans>
					</Button>
				)}
			</AlertActions>
		</Alert>
	);
}
/** Consent is an explicit choice before preparation/staging; a decline makes no mutation request. */
export function ReviewLaunch({
	kind,
	prepare,
	onStarted,
	children,
	disabled = false,
}: {
	kind: "review.wording" | "review.extraction";
	prepare: () => Promise<{ sources: SourceRevision[]; parameters: Record<string, unknown> }>;
	onStarted: (operationId: string) => void;
	children: ReactNode;
	disabled?: boolean;
}) {
	const copy = useAssistantCopy();
	const availability = useQuery(orpc.ai.availability.queryOptions());
	const usage = useQuery(orpc.ai.usage.get.queryOptions());
	const [open, setOpen] = useState(false);
	const [request, setRequest] = useState<OperationRequest | null>(null);
	const state = assistantAvailability(
		availability.data,
		usage.data?.operations.remaining,
		usage.data?.operations.reserved,
	);
	const start = useMutation({
		mutationFn: async () => {
			let pending = request;
			if (!pending) {
				const notices = await client.ai.processing.notices({});
				// Route ordering is server policy. Never silently switch to a second processor.
				const notice = notices.find((notice) => notice.purposes.includes(kind));
				if (!notice) throw new Error("AI_UNAVAILABLE");
				await client.ai.processing.grant({ route: notice.route, purpose: kind, noticeVersion: notice.noticeVersion });
				const prepared = await prepare();
				pending = {
					...prepared,
					requestKey: crypto.randomUUID(),
					kind,
					route: notice.route,
					consentVersion: notice.noticeVersion,
				};
				setRequest(pending);
			}
			const preflight = await client.ai.operations.preflight(pending);
			if (!preflight.available) throw new Error(preflight.reason ?? "AI_UNAVAILABLE");
			return client.ai.operations.start(pending);
		},
		onSuccess: (operation) => {
			setOpen(false);
			setRequest(null);
			onStarted(operation.id);
			void usage.refetch();
		},
	});
	if (availability.error || usage.error)
		return (
			<ReviewNotice
				retry={() => {
					void availability.refetch();
					void usage.refetch();
				}}
			>
				<Trans>Could not check assistant availability. Your draft is kept.</Trans>
			</ReviewNotice>
		);
	if (state === "loading") return <QuerySkeleton shape="rows" label={<Trans>Loading assistant availability…</Trans>} />;
	if (state === "not_enabled")
		return (
			<Alert variant="info">
				<Icon name="info" />
				<AlertTitle>{copy("review.assistant.status.disabled")}</AlertTitle>
				<AlertDescription>{copy("review.assistant.disabledHint")}</AlertDescription>
			</Alert>
		);
	if (state === "unavailable")
		return (
			<ReviewNotice
				retry={() => {
					void availability.refetch();
					void usage.refetch();
				}}
			>
				{copy("review.assistant.error.unavailableTitle")}
			</ReviewNotice>
		);
	if (state === "exhausted") return <ReviewNotice>{copy("billing.usage.startOperationsLimitHint")}</ReviewNotice>;
	if (state === "busy")
		return (
			<ReviewNotice>
				<Trans>An operation is already in progress. Your writing is kept.</Trans>
			</ReviewNotice>
		);
	return (
		<>
			<Button
				disabled={disabled || start.isPending}
				onClick={() => {
					start.reset();
					setOpen(true);
				}}
			>
				{children}
			</Button>
			<Dialog
				open={open}
				onOpenChange={(next) => {
					if (!start.isPending) {
						setOpen(next);
						if (!next) setRequest(null);
					}
				}}
			>
				<DialogContent>
					<DialogTitle>
						<Trans>Review with the assistant</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>
							This task uses 1 operation. It sends the selected text and related confirmed facts, without contact
							details, to the approved processing provider. Suggestions are optional and require your review.
						</Trans>
					</DialogDescription>
					<p className="type-metadata text-ink-2">{copy("billing.usage.startOperationsHint")}</p>
					{start.error && (
						<ReviewNotice>
							<Trans>Could not start this review. Your draft is kept. Retry this request or cancel.</Trans>
						</ReviewNotice>
					)}
					<DialogFooter>
						<Button
							variant="secondary"
							disabled={start.isPending}
							onClick={() => {
								setOpen(false);
								setRequest(null);
							}}
						>
							{copy("common.actions.cancel")}
						</Button>
						<Button disabled={start.isPending} onClick={() => start.mutate()}>
							<Trans>Start review</Trans>
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

export function ReviewOperationPanel({ operationId, children }: { operationId: string; children: ReactNode }) {
	const status = useQuery({
		...orpc.ai.operations.get.queryOptions({ input: { id: operationId } }),
		refetchInterval: (query) =>
			query.state.data && ["queued", "running", "cancel_requested"].includes(query.state.data.state) ? 1000 : false,
	});
	const queryClient = useQueryClient();
	const operationState = status.data?.state;
	useEffect(() => {
		if (operationState && ["waiting_review", "succeeded", "failed", "cancelled"].includes(operationState))
			void queryClient.invalidateQueries({ queryKey: orpc.ai.usage.get.queryOptions().queryKey });
	}, [operationState, queryClient]);
	const cancel = useMutation({
		mutationFn: () => client.ai.operations.cancel({ id: operationId }),
		onSuccess: () => {
			void status.refetch();
		},
	});
	if (status.error)
		return (
			<ReviewNotice
				retry={() => {
					void status.refetch();
				}}
			>
				<Trans>Could not reload this review. Your draft is kept.</Trans>
			</ReviewNotice>
		);
	if (!status.data) return <QuerySkeleton shape="rows" label={<Trans>Loading review…</Trans>} />;
	if (status.data.resultId) return children;
	if (status.data.state === "failed" || status.data.state === "cancelled")
		return (
			<ReviewNotice>
				<Trans>
					No review was delivered. No operation was deducted. You can request a new review or keep editing manually.
				</Trans>
			</ReviewNotice>
		);
	return (
		<Alert variant="info">
			<Icon name="sparkle" />
			<AlertTitle>
				<Trans>Review in progress</Trans>
			</AlertTitle>
			<AlertDescription>
				<p role="status">
					{status.data.state === "cancel_requested" ? (
						<Trans>Waiting for cancellation…</Trans>
					) : (
						<Trans>Your draft is kept while the assistant works.</Trans>
					)}
				</p>

				{cancel.error && (
					<ReviewNotice retry={() => cancel.mutate()}>
						<Trans>Cancellation could not be confirmed.</Trans>
					</ReviewNotice>
				)}
			</AlertDescription>
			<AlertActions>
				<Button
					variant="secondary"
					disabled={cancel.isPending || status.data.state === "cancel_requested"}
					onClick={() => cancel.mutate()}
				>
					<Trans>Cancel</Trans>
				</Button>
			</AlertActions>
		</Alert>
	);
}
