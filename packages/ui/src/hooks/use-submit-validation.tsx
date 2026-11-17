import { useState } from "react";

/** Validate on submission, announce inline errors, and focus the first invalid control. */
export function useSubmitValidation(issues: Record<string, string | undefined>) {
	const [submitted, setSubmitted] = useState(false);
	return {
		errors: submitted ? issues : {},
		reset: () => setSubmitted(false),
		validate: () => {
			setSubmitted(true);
			const first = Object.entries(issues).find(([, message]) => message);
			if (!first) return true;
			queueMicrotask(() => document.getElementById(first[0])?.focus());
			return false;
		},
	};
}
