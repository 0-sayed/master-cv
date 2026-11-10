import type { AuthSession } from "@reactive-resume/auth/types";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@reactive-resume/ui/components/dropdown-menu";
import { Icon } from "@reactive-resume/ui/components/icon";
import { toast } from "@reactive-resume/ui/components/toast";
import { useCurrentSession } from "@/hooks/use-current-session";
import { authClient } from "@/libs/auth/client";
import { clearPersonalStorage } from "@/libs/browser-storage";
import { getReadableErrorMessage } from "@/libs/error-message";

type Props = {
	children: ({ session }: { session: AuthSession }) => React.ComponentProps<typeof DropdownMenuTrigger>["render"];
};

export function UserDropdownMenu({ children }: Props) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const session = useCurrentSession();

	const handleLogout = async () => {
		const toastId = toast.add({ type: "loading", description: t`Signing out...` });

		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					toast.close(toastId);
					clearPersonalStorage();
					queryClient.clear();
					void router.invalidate();
				},
				onError: ({ error }) => {
					toast.add({
						type: "error",
						description: getReadableErrorMessage(
							error,
							t({
								comment: "Fallback toast when signing out fails",
								message: "Failed to sign out. Please try again.",
							}),
						),
						id: toastId,
					});
				},
			},
		});
	};

	if (!session?.user) return null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={children({ session: session as AuthSession })} />

			<DropdownMenuContent align="start" side="top">
				<DropdownMenuGroup>
					<DropdownMenuLabel className="grid gap-0.5">
						<bdi className="type-label">{session.user.name}</bdi>
						<bdi dir="ltr" className="type-metadata font-normal text-ink-2">
							{session.user.email}
						</bdi>
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem render={<Link to="/dashboard/settings/account" />}>
						<Icon name="user" size={16} />
						<Trans context="account.settings.accountTab">Account</Trans>
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuItem onClick={handleLogout}>
					<Icon name="sign-out" size={16} />
					<Trans context="account.session.signOut" comment="User menu action to sign out of current account">
						Sign out
					</Trans>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
