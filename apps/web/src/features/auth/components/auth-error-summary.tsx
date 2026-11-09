import { useEffect, useRef } from "react";

export function AuthErrorSummary({ message, field }: { message: string | null; field?: string | undefined }) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (message) ref.current?.focus();
	}, [message]);
	if (!message) return null;
	return (
		<div
			ref={ref}
			role="alert"
			tabIndex={-1}
			className="rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm text-danger outline-offset-4"
		>
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
		</div>
	);
}
