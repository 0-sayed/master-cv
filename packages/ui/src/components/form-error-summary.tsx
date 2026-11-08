import { useEffect, useId, useRef } from "react";
type FormErrorSummaryProps = { title: string; errors: readonly { fieldId: string; message: string }[] };
/** Mount after a failed submission. Inline field errors remain the authoritative descriptions. */
export function FormErrorSummary({ title, errors }: FormErrorSummaryProps) {
	const ref = useRef<HTMLDivElement>(null);
	const titleId = useId();
	const hasErrors = errors.length > 0;
	useEffect(() => {
		if (hasErrors) ref.current?.focus();
	}, [hasErrors]);
	if (!hasErrors) return null;
	return (
		<div
			ref={ref}
			role="alert"
			tabIndex={-1}
			aria-labelledby={titleId}
			className="grid gap-2 rounded-xl border border-danger bg-danger-soft p-4 wrap-anywhere text-danger-text"
		>
			<p id={titleId} className="font-semibold">
				{title}
			</p>
			<ul className="list-inside list-disc">
				{errors.map(({ fieldId, message }) => (
					<li key={fieldId}>
						<a
							className="underline underline-offset-2"
							href={`#${encodeURIComponent(fieldId)}`}
							onClick={(event) => {
								const field = document.getElementById(fieldId);
								if (field) {
									event.preventDefault();
									field.focus();
									field.scrollIntoView?.({ block: "nearest" });
								}
							}}
						>
							{message}
						</a>
					</li>
				))}
			</ul>
		</div>
	);
}
