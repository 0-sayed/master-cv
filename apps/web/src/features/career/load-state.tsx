import { Trans } from "@lingui/react/macro";
import { Alert, AlertDescription } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";

type CareerLoadErrorProps = { retrying?: boolean; onRetry: () => void };

export function CareerLoadError({ onRetry, retrying = false }: CareerLoadErrorProps) {
	return (
		<Alert variant="error">
			<AlertDescription className="grid justify-items-start gap-2">
				<p>
					<Trans>Couldn't load this. Your saved data hasn't changed.</Trans>
				</p>
				<Button variant="secondary" loading={retrying} onClick={onRetry}>
					<Trans>Try again</Trans>
				</Button>
			</AlertDescription>
		</Alert>
	);
}
