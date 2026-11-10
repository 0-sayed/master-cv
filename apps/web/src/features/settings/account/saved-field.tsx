import type { ReactNode } from "react";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useId, useState } from "react";
import { Input } from "@reactive-resume/ui/components/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "@reactive-resume/ui/components/input-group";
import { Label } from "@reactive-resume/ui/components/label";
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
	const [saved, setSaved] = useState(false);

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
		id,
		type,
		dir: type === "email" || prefix ? ("ltr" as const) : undefined,
		disabled: saving,
		value: draft,
		autoComplete,
		"aria-invalid": error ? true : undefined,
		"aria-describedby": error ? `${id}-error` : hint ? `${id}-hint` : undefined,
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
		<div className={cn("grid content-start gap-1.5", className)}>
			<Label htmlFor={id}>{label}</Label>
			{prefix ? (
				<InputGroup dir="ltr">
					<InputGroupAddon>
						<InputGroupText>{prefix}</InputGroupText>
					</InputGroupAddon>
					<InputGroupInput {...inputProps} />
				</InputGroup>
			) : (
				<Input {...inputProps} />
			)}
			<p role="status" aria-live="polite" className="type-metadata text-ink-3">
				{saving
					? t({ message: "Saving…", context: "editor.save.status.saving" })
					: saved
						? (savedMessage ?? t({ message: "Saved", context: "editor.save.status.saved" }))
						: null}
			</p>
			{error ? (
				<p id={`${id}-error`} role="alert" className="type-metadata text-danger-text">
					{error}
				</p>
			) : (
				hint && (
					<p id={`${id}-hint`} className="type-metadata text-ink-3">
						{hint}
					</p>
				)
			)}
		</div>
	);
}
