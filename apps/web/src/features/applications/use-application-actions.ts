import type { Application } from "./types";
import type { ApplicationClosedReason, ApplicationStatus } from "@reactive-resume/schema/applications/data";
import { t } from "@lingui/core/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { toast } from "@reactive-resume/ui/components/toast";
import { applicationsListQueryKey } from "./queries";
import { getStageLabel } from "./stages";
import { getOrpcErrorMessage } from "@/libs/error-message";
import { orpc } from "@/libs/orpc/client";

/** Refreshes everything that shows applications: the list, the open one, stats, tags and documents' job lines. */
export function useInvalidateApplications() {
	const queryClient = useQueryClient();

	return (id?: string) => {
		void queryClient.invalidateQueries({ queryKey: applicationsListQueryKey() });
		void queryClient.invalidateQueries({ queryKey: orpc.applications.stats.queryKey() });
		void queryClient.invalidateQueries({ queryKey: orpc.applications.tags.queryKey() });
		void queryClient.invalidateQueries({ queryKey: orpc.documents.list.key() });
		if (id) void queryClient.invalidateQueries({ queryKey: orpc.applications.getById.queryKey({ input: { id } }) });
	};
}

const failed = (error: unknown) =>
	toast.add({
		type: "error",
		description: getOrpcErrorMessage(error, { fallback: t`Something went wrong. Try again.` }),
	});

/**
 * Stage changes, closing and deleting, shared by the list, board and detail sheet. A move shows at once (the list
 * updates optimistically) and says so in a toast, whichever way it was made.
 */
export function useApplicationActions() {
	const queryClient = useQueryClient();
	const invalidate = useInvalidateApplications();
	const listKey = applicationsListQueryKey();
	const pending = useRef(new Set<string>());

	const update = useMutation({
		...orpc.applications.update.mutationOptions(),
		onMutate: async (input) => {
			await queryClient.cancelQueries({ queryKey: listKey });
			const previous = queryClient.getQueryData<Application[]>(listKey);
			const status = input.status as ApplicationStatus | undefined;
			queryClient.setQueryData<Application[]>(listKey, (rows) =>
				rows?.map((row): Application =>
					row.id === input.id
						? {
								...row,
								...(status ? { status } : {}),
								...(input.closedReason !== undefined ? { closedReason: input.closedReason } : {}),
							}
						: row,
				),
			);
			return { previous };
		},
		onError: (error, _input, context) => {
			if (context?.previous) queryClient.setQueryData(listKey, context.previous);
			failed(error);
		},
		onSuccess: (saved) => {
			queryClient.setQueryData<Application[]>(listKey, (rows) =>
				rows?.map((row) => (row.id === saved.id ? saved : row)),
			);
			queryClient.setQueryData(orpc.applications.getById.queryKey({ input: { id: saved.id } }), saved);
		},
		onSettled: (_data, _error, input) => {
			pending.current.delete(input.id);
			invalidate(input.id);
		},
	});

	const remove = useMutation({
		...orpc.applications.delete.mutationOptions(),
		onSuccess: (_data, input) => {
			invalidate(input.id);
			toast.add({ description: t`Application deleted` });
		},
		onError: failed,
	});

	const changeStage = (
		application: Pick<Application, "id" | "updatedAt">,
		status: ApplicationStatus,
		closedReason?: ApplicationClosedReason,
	) => {
		if (pending.current.has(application.id)) return;
		pending.current.add(application.id);
		const current =
			queryClient.getQueryData<Application[]>(listKey)?.find((row) => row.id === application.id) ??
			queryClient.getQueryData<Application>(orpc.applications.getById.queryKey({ input: { id: application.id } })) ??
			application;
		update.mutate(
			{
				id: application.id,
				expectedUpdatedAt: new Date(current.updatedAt).toISOString(),
				status,
				...(closedReason ? { closedReason } : {}),
			},
			{
				onSuccess: () =>
					toast.add({ description: closedReason ? t`Application closed` : t`Moved to ${getStageLabel(status)}` }),
			},
		);
	};
	return {
		update,
		remove,
		moveTo: (application: Pick<Application, "id" | "updatedAt">, status: ApplicationStatus) =>
			changeStage(application, status),
		close: (application: Pick<Application, "id" | "updatedAt">, closedReason: ApplicationClosedReason) =>
			changeStage(application, "closed", closedReason),
	};
}
