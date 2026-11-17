import { t } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { Alert, AlertActions, AlertDescription, AlertTitle } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Label } from "@reactive-resume/ui/components/label";
import { NativeSelect } from "@reactive-resume/ui/components/native-select";
import { formatInterfaceDate } from "@/libs/locale";
import { client } from "@/libs/orpc/client";

export function ResumeVersionSelect({
	resumeId,
	value,
	onChange,
	disabled = false,
}: {
	resumeId: string | null;
	value: string | null;
	onChange: (value: string | null) => void;
	disabled?: boolean;
}) {
	const id = useId();
	const { i18n } = useLingui();
	const versions = useQuery({
		queryKey: ["application-resume-versions", resumeId],
		queryFn: () => {
			if (!resumeId) throw new Error("Select a CV before loading versions.");
			return client.resume.listVersions({ resumeId });
		},
		enabled: Boolean(resumeId),
	});
	if (!resumeId) return null;
	return (
		<div className="grid gap-2">
			<Label htmlFor={id}>
				<Trans>CV version</Trans>
			</Label>
			<NativeSelect
				id={id}
				value={value ?? ""}
				disabled={disabled || versions.isPending || versions.isError}
				onChange={(event) => onChange(event.target.value || null)}
			>
				<option value="">{t`Current CV when recorded`}</option>
				{versions.data?.map((version) => (
					<option key={version.id} value={version.id} dir="auto">
						{version.name ??
							formatInterfaceDate(version.createdAt, i18n.locale, { dateStyle: "short", timeStyle: "short" })}
					</option>
				))}
			</NativeSelect>
			{versions.isError && (
				<Alert variant="error">
					<Icon name="warning" />
					<AlertTitle>
						<Trans>CV versions could not load.</Trans>
					</AlertTitle>
					<AlertDescription>
						<Trans>Your selection stays unchanged.</Trans>
					</AlertDescription>
					<AlertActions>
						<Button variant="ghost" onClick={() => void versions.refetch()}>
							<Trans>Retry</Trans>
						</Button>
					</AlertActions>
				</Alert>
			)}
		</div>
	);
}
