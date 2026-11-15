import type { ReactNode } from "react";
import { Alert, AlertTitle, AlertDescription, AlertActions } from "@reactive-resume/ui/components/alert";
import { Icon } from "@reactive-resume/ui/components/icon";
export function PrivacyNotice({
	title,
	children,
	action,
	error = false,
}: {
	title: ReactNode;
	children?: ReactNode;
	action?: ReactNode;
	error?: boolean;
}) {
	return (
		<Alert variant={error ? "error" : "info"}>
			<Icon name={error ? "warning" : "info"} />
			<AlertTitle>{title}</AlertTitle>
			{children && <AlertDescription>{children}</AlertDescription>}
			{action && <AlertActions>{action}</AlertActions>}
		</Alert>
	);
}
