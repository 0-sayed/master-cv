import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useRouteContext, useSearch } from "@tanstack/react-router";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { toast } from "@reactive-resume/ui/components/toast";
import { SettingsRow, SettingsSection } from "../section";
import { DataSection } from "./data";
import { ProfileSection } from "./profile";
import { SecuritySection } from "./security";
import { useSignOut } from "@/features/auth/use-sign-out";
import { getReadableErrorMessage } from "@/libs/error-message";

export function AccountSettings() {
	const { session } = useRouteContext({ from: "/dashboard" });
	const { deleteAccount } = useSearch({ from: "/dashboard/settings/account" });

	return (
		<>
			<ProfileSection session={session} />
			<SecuritySection />
			<DataSection openDeletion={deleteAccount ?? false} />
			<SettingsSection width="full" presentation="card" title={<Trans>Current session</Trans>}>
				<SettingsRow title={<bdi dir="ltr">{session.user.email}</bdi>}>
					<SignOutButton />
				</SettingsRow>
			</SettingsSection>
		</>
	);
}

export function SignOutButton() {
	const signOut = useSignOut();

	return (
		<Button
			variant="secondary"
			onClick={async () => {
				try {
					await signOut();
				} catch (error) {
					toast.add({
						type: "error",
						description: getReadableErrorMessage(error, t`Failed to sign out. Please try again.`),
					});
				}
			}}
		>
			<Icon name="sign-out" size={18} />
			<Trans context="workspace.privacy.48f0d3d397d4">Sign out</Trans>
		</Button>
	);
}
