import { Trans } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouteContext, useRouter, useSearch } from "@tanstack/react-router";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { SettingsRow, SettingsSection } from "../section";
import { DataSection } from "./data";
import { ProfileSection } from "./profile";
import { SecuritySection } from "./security";
import { authClient } from "@/libs/auth/client";
import { clearPersonalStorage } from "@/libs/browser-storage";

export function AccountSettings() {
	const { session } = useRouteContext({ from: "/dashboard" });
	const { deleteAccount } = useSearch({ from: "/dashboard/settings/account" });

	return (
		<>
			<ProfileSection session={session} />
			<SecuritySection />
			<DataSection openDeletion={deleteAccount ?? false} />
			<SettingsSection title={<Trans>Current session</Trans>}>
				<SettingsRow title={<bdi dir="ltr">{session.user.email}</bdi>}>
					<SignOutButton />
				</SettingsRow>
			</SettingsSection>
		</>
	);
}

export function SignOutButton() {
	const router = useRouter();
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	return (
		<Button
			size="sm"
			variant="secondary"
			onClick={async () => {
				await authClient.signOut();
				clearPersonalStorage();
				queryClient.clear();
				await navigate({ to: "/" });
				void router.invalidate();
			}}
		>
			<Icon name="sign-out" size={18} />
			<Trans>Sign out</Trans>
		</Button>
	);
}
