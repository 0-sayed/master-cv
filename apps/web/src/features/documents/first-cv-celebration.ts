import type { QueryClient } from "@tanstack/react-query";
import { t } from "@lingui/core/macro";
import { toast } from "@reactive-resume/ui/components/toast";
import { orpc } from "@/libs/orpc/client";

/** Capture the known empty library before creation; unknown counts never imply a first CV. */
export function prepareFirstCvCelebration(queryClient: QueryClient) {
	const counts = queryClient.getQueryData(orpc.documents.counts.queryKey());
	const first = counts?.resume === 0 && counts.trash === 0;
	let acknowledged = false;
	return (description?: string) => {
		if (!first || acknowledged) return false;
		acknowledged = true;
		toast.add({
			type: "celebration",
			description: description ?? t({ message: "Saved", context: "editor.save.status.saved" }),
		});
		return true;
	};
}
