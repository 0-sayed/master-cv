import type { RouterOutput } from "@/libs/orpc/client";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { ActionGroup } from "@reactive-resume/ui/components/action-group";
import { Alert, AlertTitle, AlertDescription } from "@reactive-resume/ui/components/alert";
import { Button, buttonVariants } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { resolveUiLocale } from "@reactive-resume/utils/locale";
import { formatUiTimestamp } from "@reactive-resume/utils/ui-format";

type ExportStatusProps = {
	request: RouterOutput["privacy"]["exportStatus"] | null;
	onRequest: () => void;
	requesting?: boolean;
};
export function ExportStatus({ request, onRequest, requesting = false }: ExportStatusProps) {
	const { i18n } = useLingui();
	const expiresAt = request?.expiresAt;
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		if (request?.status !== "ready" || !expiresAt) return;
		const timer = setTimeout(() => setNow(Date.now()), Math.max(0, Date.parse(expiresAt) - Date.now()));
		return () => clearTimeout(timer);
	}, [expiresAt, request?.status]);
	// Never offer a known-expired link between polling/refetches.
	const status = request?.status === "ready" && expiresAt && Date.parse(expiresAt) <= now ? "expired" : request?.status;
	const preparing = status === "queued" || status === "preparing";
	const retry = status === "failed" || status === "expired" || status === "cancelled";
	if (!request)
		return (
			<>
				<Alert role="status">
					<Icon name="download" />
					<AlertTitle>
						<Trans context="privacy.dataExport.none">No data copy requested yet</Trans>
					</AlertTitle>
				</Alert>
				<ActionGroup responsive="stack">
					<Button loading={requesting} onClick={onRequest}>
						<Icon name="download" />
						<Trans context="privacy.dataExport.request">Request a copy of my data</Trans>
					</Button>
				</ActionGroup>
			</>
		);

	return (
		<>
			<Alert
				role="status"
				aria-live="polite"
				variant={status === "failed" ? "error" : status === "ready" ? "success" : "default"}
			>
				<Icon
					name={
						status === "failed" ? "warning" : status === "ready" ? "check-circle" : preparing ? "clock" : "download"
					}
				/>
				<AlertTitle>
					{status === "queued" && <Trans context="workspace.privacy.a92c68bfa25c">Your data copy is queued.</Trans>}
					{status === "preparing" && (
						<Trans context="privacy.dataExport.preparingTitle">Preparing your data copy</Trans>
					)}
					{status === "ready" && <Trans context="privacy.dataExport.readyTitle">Your data copy is ready</Trans>}
					{status === "expired" && <Trans context="workspace.privacy.ae1d88f0e45b">Your data copy expired</Trans>}
					{status === "cancelled" && (
						<Trans context="workspace.privacy.5722ef9e3d6b">Your data copy was cancelled</Trans>
					)}
					{status === "failed" && <Trans context="workspace.privacy.242030643f67">Could not prepare your copy</Trans>}
				</AlertTitle>
				{status === "ready" && (
					<>
						<AlertDescription>
							<Trans context="privacy.dataExport.privateLinkHint">
								The link is private and requires sign-in. It contains only your data, without system secrets or anyone
								else's data.
							</Trans>
						</AlertDescription>
						{expiresAt && (
							<AlertDescription>
								<Trans context="privacy.dataExport.expiry">
									Available until{" "}
									{formatUiTimestamp(new Date(expiresAt), resolveUiLocale({ requested: i18n.locale }), {
										dateStyle: "medium",
										timeStyle: "short",
									})}{" "}
									(Saudi time)
								</Trans>
							</AlertDescription>
						)}
					</>
				)}
				{preparing && (
					<AlertDescription>
						<Trans context="privacy.dataExport.wait">
							You can leave this page. Your status updates here and we email you when it is ready.
						</Trans>
					</AlertDescription>
				)}
				{status === "failed" && (
					<AlertDescription>
						<Trans context="workspace.privacy.3777ef11e644">
							The request can be retried. No partial archive is available.
						</Trans>
					</AlertDescription>
				)}
			</Alert>
			{status === "ready" && request ? (
				<ActionGroup responsive="stack">
					<a
						className={buttonVariants({ variant: "primary" })}
						href={`/api/privacy/exports/${encodeURIComponent(request.id)}`}
					>
						<Icon name="download" />
						<Trans context="privacy.dataExport.download">Download copy</Trans>
					</a>
				</ActionGroup>
			) : (
				!preparing && (
					<ActionGroup responsive="stack">
						<Button loading={requesting} onClick={onRequest}>
							<Icon name="download" />
							{retry ? (
								<Trans context="privacy.dataExport.retry">Request another copy</Trans>
							) : (
								<Trans context="privacy.dataExport.request">Request a copy of my data</Trans>
							)}
						</Button>
					</ActionGroup>
				)
			)}
		</>
	);
}
