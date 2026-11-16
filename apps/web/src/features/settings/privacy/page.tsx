import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@reactive-resume/ui/components/accordion";
import { ActionGroup } from "@reactive-resume/ui/components/action-group";
import { Button, buttonVariants } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { toast } from "@reactive-resume/ui/components/toast";
import { SettingsSection } from "../section";
import { ExportStatus } from "./export-status";
import { PrivacyNotice } from "./notice";
import { QuerySkeleton } from "@/components/query-skeleton";
import { ConfirmAccountAccess } from "@/dialogs/auth/confirm-account-access";
import { useUiLocale } from "@/features/locale/provider";
import { client, orpc } from "@/libs/orpc/client";
export function PrivacyPage() {
	const { locale } = useUiLocale();
	const [nonce, setNonce] = useState<string | null>(null);
	const query = useQueryClient();
	const latest = useQuery({
		...orpc.privacy.latestExport.queryOptions(),
		refetchInterval: (query) => (["queued", "preparing"].includes(query.state.data?.status ?? "") ? 2000 : false),
	});
	const previous = useRef(latest.data);
	useEffect(() => {
		const before = previous.current;
		const current = latest.data;
		if (current?.status === "ready" && before?.id === current.id && ["queued", "preparing"].includes(before.status))
			toast.add({ description: t({ message: "Your data copy is ready", context: "privacy.dataExport.readyTitle" }) });
		previous.current = current;
	}, [latest.data]);
	const request = useMutation({
		mutationFn: (input: { proofToken: string; requestNonce: string }) => client.privacy.requestExport(input),
		onSuccess: async (value) => {
			query.setQueryData(orpc.privacy.latestExport.queryOptions().queryKey, value);
			setNonce(null);
			await query.invalidateQueries();
		},
	});
	const begin = () => {
		request.reset();
		setNonce(crypto.randomUUID());
	};
	return (
		<>
			<SettingsSection
				width="full"
				presentation="card"
				title={<Trans context="privacy.storage.title">What we store</Trans>}
			>
				<Accordion>
					<AccordionItem>
						<AccordionTrigger icon="user">
							<Trans context="privacy.storage.accountTitle">Your account</Trans>
						</AccordionTrigger>
						<AccordionContent>
							<Trans context="privacy.storage.accountDescription">
								Name, email and password (hashed). We do not ask for national ID or health information.
							</Trans>
						</AccordionContent>
					</AccordionItem>
					<AccordionItem>
						<AccordionTrigger icon="files">
							<Trans context="privacy.storage.cvsTitle">Your CVs and career information</Trans>
						</AccordionTrigger>
						<AccordionContent>
							<Trans context="privacy.storage.cvsDescription">Each copy and its revision history.</Trans>
						</AccordionContent>
					</AccordionItem>
					<AccordionItem>
						<AccordionTrigger icon="upload">
							<Trans context="privacy.storage.uploadsTitle">Your uploaded files</Trans>
						</AccordionTrigger>
						<AccordionContent>
							<Trans context="workspace.privacy.d7b22c481606">
								Retained imports, attachments, pictures and generated documents.
							</Trans>
						</AccordionContent>
					</AccordionItem>
					<AccordionItem>
						<AccordionTrigger icon="sparkle">
							<Trans context="privacy.storage.aiTitle">Assistant requests</Trans>
						</AccordionTrigger>
						<AccordionContent>
							<Trans context="workspace.privacy.59442732fa1f">
								AI is optional and requires explicit approval and processing consent. Available processing routes and
								their notices are shown before use.
							</Trans>
						</AccordionContent>
					</AccordionItem>
				</Accordion>
				<ActionGroup>
					<Link
						to="/privacy-and-terms"
						search={{ tab: "privacy", locale }}
						className={buttonVariants({ variant: "link", size: "link-touch" })}
					>
						<Trans context="privacy.policy.help">Privacy policy and help</Trans>
						<Icon name="arrow-square-out" />
					</Link>
				</ActionGroup>
			</SettingsSection>
			<SettingsSection
				id="data-export"
				width="full"
				presentation="card"
				title={<Trans context="privacy.dataExport.heading">Download your data</Trans>}
				description={
					<Trans context="privacy.dataExport.summary">Keep a copy of your account, career information and CVs.</Trans>
				}
			>
				<p className="type-body text-ink-2">
					<Trans context="privacy.dataExport.format">
						Machine-readable JSON in a ZIP archive, including your files.
					</Trans>
				</p>
				<p className="type-body text-ink-2">
					<Trans context="privacy.dataExport.timing">
						Preparation time depends on the size of your data. We show the status here and email you when it is ready.
					</Trans>
				</p>
				{latest.isPending && (
					<QuerySkeleton
						shape="settings"
						count={1}
						label={<Trans context="workspace.privacy.0d79b412fa4e">Loading export status…</Trans>}
					/>
				)}
				{latest.isError && (
					<PrivacyNotice
						error
						title={<Trans context="workspace.privacy.270ead5517b8">Export status is unavailable</Trans>}
						action={
							<Button variant="secondary" onClick={() => void latest.refetch()}>
								<Trans context="workspace.privacy.d8b8392e2c54">Try again</Trans>
							</Button>
						}
					/>
				)}
				{latest.isSuccess && !latest.isError && (
					<ExportStatus request={latest.data} onRequest={begin} requesting={request.isPending} />
				)}
				{request.isError && (
					<PrivacyNotice
						error
						title={<Trans context="workspace.privacy.3385155dcbc6">Export request was not confirmed</Trans>}
					>
						<Trans context="workspace.privacy.861f23650689">Confirm access again to retry.</Trans>
					</PrivacyNotice>
				)}
			</SettingsSection>
			<SettingsSection
				width="full"
				presentation="danger"
				title={<Trans context="privacy.deletion.title">Delete account</Trans>}
				description={
					<Trans context="privacy.deletion.description">
						Deletes your account, all CVs and career information. Cannot be undone once deletion is complete.
					</Trans>
				}
			>
				<p className="type-body text-ink-2">
					<Trans context="privacy.deletion.uploads">
						Your uploaded files, saved copies and revision history are also deleted.
					</Trans>
				</p>
				<p className="type-body text-ink-2">
					<Trans context="privacy.deletion.timing">
						Access is revoked when your request is accepted. Active data is then erased; completion waits for any
						required processor erasure and renewal cancellation.
					</Trans>
				</p>
				<p className="type-body text-ink-2">
					<Trans context="privacy.deletion.retained">
						Backups follow a separate retention cycle. A minimal restricted deletion record is kept to prevent your data
						from returning after recovery. Retention periods will be published before launch.
					</Trans>
				</p>
				<ActionGroup responsive="stack">
					<Button variant="secondary" nativeButton={false} role="link" render={<a href="#data-export" />}>
						<Icon name="download" />
						<Trans context="privacy.deletion.downloadFirst">Download your data first</Trans>
					</Button>
					<Button
						variant="danger"
						nativeButton={false}
						role="link"
						render={<Link to="/dashboard/settings/delete-account" />}
					>
						<Icon name="trash" />
						<Trans context="workspace.privacy.f0272a29a5d0">Review account deletion</Trans>
					</Button>
				</ActionGroup>
			</SettingsSection>
			{nonce && (
				<ConfirmAccountAccess
					action="export_account"
					requestNonce={nonce}
					onCancel={() => setNonce(null)}
					onVerified={(proof) => {
						request.mutate({ proofToken: proof.token, requestNonce: nonce });
						setNonce(null);
					}}
				/>
			)}
		</>
	);
}
