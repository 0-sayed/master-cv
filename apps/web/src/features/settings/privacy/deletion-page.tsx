import { Plural, Trans } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouteContext } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@reactive-resume/ui/components/button";
import { Checkbox } from "@reactive-resume/ui/components/checkbox";
import { DialogFooter } from "@reactive-resume/ui/components/dialog";
import { Label } from "@reactive-resume/ui/components/label";
import { SettingsSection } from "../section";
import { PrivacyNotice } from "./notice";
import { QuerySkeleton } from "@/components/query-skeleton";
import { ConfirmAccountAccess, type AccountProof } from "@/dialogs/auth/confirm-account-access";
import { authIdentity } from "@/libs/auth/identity";
import { clearPersonalStorage } from "@/libs/browser-storage";
import { client, orpc } from "@/libs/orpc/client";
export function DeletionPage() {
	const { session } = useRouteContext({ from: "/dashboard" });
	const query = useQueryClient();
	const [nonce] = useState(() => crypto.randomUUID());
	const [confirming, setConfirming] = useState(false);
	const [proof, setProof] = useState<AccountProof | null>(null);
	const [consent, setConsent] = useState(false);
	const submitting = useRef(false);
	useEffect(() => {
		if (!proof) return;
		const timer = setTimeout(() => setProof(null), Math.max(0, Date.parse(proof.expiresAt) - Date.now()));
		return () => clearTimeout(timer);
	}, [proof]);
	const counts = useQuery(orpc.documents.counts.queryOptions());
	const remove = useMutation({
		mutationFn: async () => {
			if (!consent || !proof) throw new Error("CONFIRMATION_REQUIRED");
			return await client.privacy.requestDeletion({ proofToken: proof.token, requestNonce: nonce, confirmed: true });
		},
		onSuccess: async () => {
			await query.cancelQueries();
			clearPersonalStorage(session.user.id);
			authIdentity(query).accept(null);
			query.clear();
			window.location.replace("/deletion-requested");
		},
		onError: () => setProof(null),
		onSettled: () => {
			submitting.current = false;
		},
	});
	return (
		<>
			<SettingsSection title={<Trans context="privacy.deletion.scopeTitle">What will be deleted</Trans>}>
				<p>
					<Trans context="privacy.deletion.accountScope">Your account and sign-in information</Trans>
				</p>
				{counts.isPending ? (
					<QuerySkeleton
						shape="settings"
						count={1}
						label={<Trans context="workspace.privacy.1c104bbb3ee4">Loading documents…</Trans>}
					/>
				) : counts.isError ? (
					<PrivacyNotice
						error
						title={<Trans context="workspace.privacy.1e4bab7945b6">Document counts are unavailable</Trans>}
						action={
							<Button variant="secondary" onClick={() => void counts.refetch()}>
								<Trans context="workspace.privacy.d8b8392e2c54">Try again</Trans>
							</Button>
						}
					/>
				) : (
					<p>
						<Plural
							value={(counts.data?.resume ?? 0) + (counts.data?.letter ?? 0) + (counts.data?.trash ?? 0)}
							context="workspace.privacy.a00fbb81752d"
							one="# document, including trash, copies and revision history"
							other="# documents, including trash, copies and revision history"
						/>
					</p>
				)}
				<p>
					<Trans context="privacy.deletion.careerScope.compact">Your career information and uploaded files</Trans>
				</p>
			</SettingsSection>
			<SettingsSection title={<Trans context="privacy.deletion.retentionTitle">What may remain</Trans>}>
				<p>
					<Trans context="workspace.privacy.4a8e98f2ed75">
						Active erasure runs after access is revoked. Backups follow a separate approved cycle. A minimal restricted
						deletion record remains for recovery protection. Pending processor erasure or renewal cancellation prevents
						completion.
					</Trans>
				</p>
			</SettingsSection>
			<PrivacyNotice
				title={<Trans context="privacy.deletion.preparationTitle">Before deleting</Trans>}
				action={
					<Link className={buttonVariants({ variant: "secondary" })} to="/dashboard/settings/privacy">
						<Trans context="privacy.dataExport.requestShort">Request a copy</Trans>
					</Link>
				}
			>
				<Trans context="privacy.deletion.backupHint">Download a copy of your data if you want to keep it.</Trans>
			</PrivacyNotice>
			{remove.isError && (
				<PrivacyNotice
					error
					title={<Trans context="workspace.privacy.c0cb010c643c">Deletion request was not confirmed</Trans>}
				>
					<Trans context="workspace.privacy.409a5ad58b50">
						A lost response does not confirm deletion. If you can still sign in, confirm access and try again. Otherwise
						contact support.
					</Trans>
					<a href="/help" className={buttonVariants({ variant: "link", size: "link-touch" })}>
						<Trans context="help.page.title">Help and contact</Trans>
					</a>
				</PrivacyNotice>
			)}
			{proof ? (
				<PrivacyNotice title={<Trans context="workspace.privacy.f092f965b609">Access confirmed</Trans>}>
					<Trans context="privacy.deletion.proofConfirmedHint">
						Continue reviewing your deletion request. Your account will only be deleted after your final confirmation.
					</Trans>
				</PrivacyNotice>
			) : (
				<Button variant="secondary" onClick={() => setConfirming(true)}>
					<Trans context="workspace.privacy.a0316314c96d">Confirm access</Trans>
				</Button>
			)}
			<Label>
				<Checkbox checked={consent} onCheckedChange={(checked) => setConsent(checked === true)} />
				<Trans context="privacy.deletion.consent">I understand deletion is final once complete</Trans>
			</Label>
			<DialogFooter>
				<Link className={buttonVariants({ variant: "secondary" })} to="/dashboard/settings/privacy">
					<Trans context="workspace.privacy.19766ed6ccb2">Cancel</Trans>
				</Link>
				<Button
					variant="danger"
					disabled={!consent || !proof || counts.isError || counts.isPending}
					loading={remove.isPending}
					onClick={() => {
						if (submitting.current) return;
						submitting.current = true;
						remove.mutate();
					}}
				>
					<Trans context="privacy.deletion.submit">Permanently delete my account</Trans>
				</Button>
			</DialogFooter>
			{confirming && (
				<ConfirmAccountAccess
					action="delete_account"
					requestNonce={nonce}
					onCancel={() => setConfirming(false)}
					onVerified={(value) => {
						setProof(value);
						setConfirming(false);
					}}
				/>
			)}
		</>
	);
}
