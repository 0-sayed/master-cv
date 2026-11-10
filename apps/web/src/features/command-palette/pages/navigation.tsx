import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { CommandItem } from "@reactive-resume/ui/components/command";
import { Icon } from "@reactive-resume/ui/components/icon";
import { useCommandPaletteStore } from "../store";
import { BaseCommandGroup } from "./base";
import { useDialogStore } from "@/dialogs/store";

export function NavigationCommandGroup() {
	const navigate = useNavigate();
	const { session } = useRouteContext({ strict: false });
	const reset = useCommandPaletteStore((state) => state.reset);
	const pushPage = useCommandPaletteStore((state) => state.pushPage);

	const onNavigate = async (path: string) => {
		await navigate({ to: path });
		reset();
	};

	return (
		<>
			<BaseCommandGroup heading={<Trans>Go to…</Trans>}>
				<CommandItem keywords={[t`Home`]} value="navigation.home" onSelect={() => onNavigate("/")}>
					<Icon name="house" size={16} />
					<Trans>Home</Trans>
				</CommandItem>

				<CommandItem
					disabled={!session}
					keywords={[
						t({ message: "Documents", context: "editor.mobileNav.documents" }),
						t`Resumes`,
						t({ message: "Cover letters", context: "editor.navigation.letters" }),
					]}
					value="navigation.documents"
					onSelect={() => onNavigate("/dashboard")}
				>
					<Icon name="file-text" size={16} />
					<Trans context="editor.mobileNav.documents">Documents</Trans>
				</CommandItem>

				<CommandItem
					disabled={!session}
					keywords={[t`New document`, t`Create`, t`Import`]}
					value="navigation.documents.new"
					onSelect={() => {
						reset();
						useDialogStore.getState().openDialog("document.new", undefined);
					}}
				>
					<Icon name="plus" size={16} />
					<Trans>New document</Trans>
				</CommandItem>

				<CommandItem
					disabled={!session}
					keywords={[t`Trash`, t`Deleted`]}
					value="navigation.trash"
					onSelect={() => onNavigate("/dashboard/trash")}
				>
					<Icon name="trash" size={16} />
					<Trans>Trash</Trans>
				</CommandItem>

				<CommandItem
					keywords={[t`ATS Checker`, t`Check a PDF`]}
					value="navigation.ats-checker"
					onSelect={() => onNavigate("/ats-checker")}
				>
					<Icon name="seal-check" size={16} />
					<Trans>ATS Checker</Trans>
				</CommandItem>

				<CommandItem
					disabled={!session}
					keywords={[t({ message: "Applications", context: "editor.navigation.applications" }), t`Jobs`]}
					value="navigation.applications"
					onSelect={() => onNavigate("/dashboard/applications")}
				>
					<Icon name="briefcase" size={16} />
					<Trans context="editor.navigation.applications">Applications</Trans>
				</CommandItem>

				<CommandItem
					disabled={!session}
					keywords={[t`New Application`, t`Add application`, t`Job`]}
					value="navigation.applications.new"
					onSelect={async () => {
						await navigate({ to: "/dashboard/applications", search: { create: true } });
						reset();
					}}
				>
					<Icon name="plus" size={16} />
					<Trans>New Application</Trans>
				</CommandItem>

				<CommandItem
					disabled={!session}
					keywords={[t({ message: "Settings", context: "account.navigation.settings" })]}
					value="navigation.settings"
					onSelect={() => pushPage("settings")}
				>
					<Icon name="gear-six" size={16} />
					<Trans context="account.navigation.settings">Settings</Trans>
				</CommandItem>
			</BaseCommandGroup>

			<BaseCommandGroup page="settings" heading={<Trans context="account.navigation.settings">Settings</Trans>}>
				<CommandItem
					keywords={[
						t({ message: "Account", context: "account.settings.accountTab" }),
						t`Profile`,
						t`Password`,
						t`Two-step verification`,
						t`Passkeys`,
						t`Export Data`,
						t`Delete Account`,
					]}
					value="navigation.settings.account"
					onSelect={() => onNavigate("/dashboard/settings/account")}
				>
					<Icon name="user-circle" size={16} />
					<Trans context="account.settings.accountTab">Account</Trans>
				</CommandItem>

				<CommandItem
					keywords={[t({ message: "Preferences", context: "account.preferences.title" }), t`Theme`, t`Language`]}
					value="navigation.settings.preferences"
					onSelect={() => onNavigate("/dashboard/settings/preferences")}
				>
					<Icon name="gear-six" size={16} />
					<Trans context="account.preferences.title">Preferences</Trans>
				</CommandItem>
			</BaseCommandGroup>
		</>
	);
}
