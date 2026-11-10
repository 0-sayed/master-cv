import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@reactive-resume/ui/components/button";
import { useSkeletonLoading } from "@reactive-resume/ui/components/skeleton";
import { SettingsRow, SettingsSection } from "../section";
import { QuerySkeleton } from "@/components/query-skeleton";
import { authClient } from "@/libs/auth/client";

const queryKey = ["auth", "connected-apps"];

export function ConnectedAppsSection() {
	const queryClient = useQueryClient();
	const {
		data: connections = [],
		isPending,
		error,
	} = useQuery({
		queryKey,
		queryFn: async () => {
			const { data, error } = await authClient.oauth2.getConsents();
			if (error) throw new Error(t`Could not load connected applications.`);
			return Promise.all(
				(data ?? []).map(async (connection) => {
					const client = await authClient.oauth2
						.publicClient({ query: { client_id: connection.clientId } })
						.catch(() => null);
					return { ...connection, clientName: client?.data?.client_name?.trim() || connection.clientId };
				}),
			);
		},
	});
	const revoke = useMutation({
		mutationFn: async (id: string) => {
			const { error } = await authClient.oauth2.deleteConsent({ id });
			if (error) throw new Error(t`Could not revoke this connection. Try again.`);
		},
		onSuccess: () => queryClient.invalidateQueries({ queryKey }),
	});

	const skeletonWait1 = useSkeletonLoading(isPending);
	return (
		<SettingsSection
			title={<Trans>Connected applications</Trans>}
			description={<Trans>Revoke an application's access to your account.</Trans>}
		>
			{error || revoke.error ? <p role="alert">{(error ?? revoke.error)?.message}</p> : null}
			{skeletonWait1.pending || isPending ? (
				<QuerySkeleton shape="settings" label={<Trans>Loading connections...</Trans>} />
			) : connections.length === 0 ? (
				<p className="type-body text-ink-3">
					<Trans>No connected applications.</Trans>
				</p>
			) : (
				<ul className="divide-y divide-line">
					{connections.map((connection) => (
						<li key={connection.id}>
							<SettingsRow
								title={<bdi className="break-all">{connection.clientName}</bdi>}
								description={connection.scopes.join(", ")}
							>
								<Button
									variant="secondary"
									size="sm"
									disabled={revoke.isPending}
									onClick={() => revoke.mutate(connection.id)}
								>
									<Trans>Revoke access</Trans>
								</Button>
							</SettingsRow>
						</li>
					))}
				</ul>
			)}
		</SettingsSection>
	);
}
