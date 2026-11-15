import { Trans } from "@lingui/react/macro";
import { createFileRoute } from "@tanstack/react-router";
import { PublicShell } from "@/features/help/public-shell";
export const Route = createFileRoute("/deletion-requested")({ component: DeletionRequestedPage });
function DeletionRequestedPage() {
	return (
		<PublicShell
			statusPage
			title={<Trans context="privacy.deletion.requestedTitle">We received your account deletion request</Trans>}
		>
			<p>
				<Trans context="workspace.privacy.c4f7d23573b7">
					Accepted deletion requests revoke access on all devices. Active erasure may still be pending. Completion is
					confirmed separately after required cleanup.
				</Trans>
			</p>
			<p>
				<Trans context="workspace.privacy.1ae0761f13c8">
					This page does not look up or confirm a particular request. If your submission response was lost, contact
					support.
				</Trans>
			</p>
		</PublicShell>
	);
}
