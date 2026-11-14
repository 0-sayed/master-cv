import { Trans } from "@lingui/react/macro";
import { Alert, AlertDescription, AlertTitle, AlertActions } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";

type LibraryErrorProps = {
	retrying: boolean;
	onRetry: () => void;
};

export function LibraryError({ retrying, onRetry }: LibraryErrorProps) {
	return (
		<Alert variant="error">
			<Icon name="warning-circle" />
			<AlertTitle>
				<Trans>Couldn't load documents</Trans>
			</AlertTitle>
			<AlertDescription>
				<p>
					<Trans>Check your connection and try again.</Trans>
				</p>
			</AlertDescription>
			<AlertActions>
				<Button variant="secondary" loading={retrying} onClick={onRetry}>
					{retrying ? <Trans>Retrying…</Trans> : <Trans>Try again</Trans>}
				</Button>
			</AlertActions>
		</Alert>
	);
}
