import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@reactive-resume/ui/components/button";
import { SettingsSection } from "../section";
export function DataSection({ openDeletion = false }: { openDeletion?: boolean }) {
	return (
		<SettingsSection width="full" presentation="card" title={<Trans>Your data</Trans>}>
			<Link
				to={openDeletion ? "/dashboard/settings/delete-account" : "/dashboard/settings/privacy"}
				className={buttonVariants({ variant: "secondary" })}
			>
				<Trans context="privacy.navigation.data">Privacy & data</Trans>
			</Link>
		</SettingsSection>
	);
}
