import { useEffect, useRef } from "react";
import { Alert } from "@reactive-resume/ui/components/alert";

export function AuthErrorSummary({ message, field }: { message: string | null; field?: string | undefined }) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (message) ref.current?.focus();
	}, [message]);
	if (!message) return null;
	return (
		<Alert variant="error" ref={ref} role="alert" tabIndex={-1} className="outline-offset-4">
			{field ? (
				<a
					href={`#${field}`}
					onClick={(event) => {
						event.preventDefault();
						document.getElementById(field)?.focus();
					}}
					className="underline"
				>
					{message}
				</a>
			) : (
				message
			)}
		</Alert>
	);
}
