import type { ReactNode } from "react";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useId, useState } from "react";
import { FormControl, FormDescription, FormItem, FormLabel, FormMessage } from "@reactive-resume/ui/components/form";
import { Input } from "@reactive-resume/ui/components/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "@reactive-resume/ui/components/input-group";
import { cn } from "@reactive-resume/utils/style";
import { isImeComposing } from "@/libs/keyboard";

type FieldProps = {
	label: string;
	value: string;
	/** Saves the new value; resolves to an error message, or null when it saved. */
	save: (value: string) => Promise<string | null>;
	validate: (value: string) => string | null;
	prefix?: string;
	hint?: ReactNode;
	type?: "text" | "email";
	autoComplete?: string;
	className?: string;
	savedMessage?: string;
};

/** A text setting that saves when it loses focus. Invalid or failed values stay, with the reason under them. */
export function SavedField({
	label,
	value,
	save,
	validate,
	prefix,
	hint,
	type = "text",
	autoComplete,
	className,
	savedMessage,
}: FieldProps) {
	useLingui();
	const id = useId();
	const [draft, setDraft] = useState(value);
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(true);

	const commit = async () => {
		if (saving) return;
		const next = draft.trim();
		if (next === value) return setError(null);
		const invalid = validate(next);
		if (invalid) return setError(invalid);
		setError(null);
		setSaved(false);
		setSaving(true);
		let failure: string | null;
		try {
			failure = await save(next);
		} catch {
			failure = t`Couldn't save. Try again.`;
		}
		setSaving(false);
		setError(failure);
		setSaved(failure === null);
	};

	const inputProps = {
		type,
		dir: type === "email" || prefix ? ("ltr" as const) : undefined,
		disabled: saving,
		value: draft,
		autoComplete,
		"aria-busy": saving || undefined,
		onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
			setDraft(event.target.value);
			setError(null);
			setSaved(false);
		},
		onBlur: () => void commit(),
		onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
			if (isImeComposing(event)) return;
			if (event.key === "Enter") event.currentTarget.blur();
			if (event.key === "Escape") {
				setDraft(value);
				setError(null);
			}
		},
	};

	return (
		<FormItem hasError={!!error} className={cn("w-full min-w-0 content-start", className)}>
			<FormLabel>{label}</FormLabel>
			<FormControl
				render={
					prefix ? (
						<InputGroup dir="ltr">
							<InputGroupAddon>
								<InputGroupText>{prefix}</InputGroupText>
							</InputGroupAddon>
							<InputGroupInput {...inputProps} />
						</InputGroup>
					) : (
						<Input {...inputProps} />
					)
				}
			/>
			<FormDescription id={`${id}-status`} role="status" aria-live="polite">
				{saving
					? t({ message: "Saving…", context: "editor.save.status.saving" })
					: saved
						? (savedMessage ?? t({ message: "Saved", context: "editor.save.status.saved" }))
						: draft !== value
							? t`Unsaved changes — leave this field to save`
							: (savedMessage ?? t({ message: "Saved", context: "editor.save.status.saved" }))}
			</FormDescription>
			{error ? <FormMessage role="alert" errors={[error]} /> : hint && <FormDescription>{hint}</FormDescription>}
		</FormItem>
	);
}
