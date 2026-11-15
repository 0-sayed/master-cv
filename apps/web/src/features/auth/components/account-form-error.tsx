import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useEffect, useRef } from "react";
import { Alert, AlertTitle, AlertDescription, AlertActions } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { accountErrorMessage } from "../errors";

type AccountFormErrorProps = { error: unknown; onRetry: () => void; pending: boolean };

/** Errors stay in the form's scroll flow, above its actions on mobile and desktop. */
export function AccountFormError({ error, onRetry, pending }: AccountFormErrorProps) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (error) ref.current?.focus();
	}, [error]);
	if (!error) return null;
	return (
		<Alert variant="error" ref={ref} tabIndex={-1}>
			<Icon name="warning" />
			<AlertTitle>{t`We could not complete this request. Please try again.`}</AlertTitle>
			<AlertDescription>{accountErrorMessage(error)}</AlertDescription>
			<AlertActions>
				<Button type="button" variant="secondary" disabled={pending} onClick={onRetry}>
					<Trans>Try again</Trans>
				</Button>
			</AlertActions>
		</Alert>
	);
}
