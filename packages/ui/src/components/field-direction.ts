import type { CSSProperties, HTMLAttributes } from "react";

type FieldDirectionOptions = Pick<HTMLAttributes<HTMLElement>, "dir" | "style"> & {
	type?: string | undefined;
	name?: string | undefined;
	autoComplete?: string | undefined;
	inputMode?: string | undefined;
	placeholder?: string | undefined;
};
const technicalTypes = new Set([
	"email",
	"url",
	"tel",
	"password",
	"number",
	"date",
	"time",
	"month",
	"week",
	"datetime-local",
]);
const technicalAutocomplete =
	/(?:^|\s)(?:username|email|url|tel(?:-[\w-]+)?|one-time-code|current-password|new-password|cc-[\w-]+)(?:\s|$)/u;
const technicalNames =
	/^(?:username|identifier|email|phone|telephone|url|website|baseUrl|apiKey|token|otp|code|verificationCode|clientId|clientSecret)$/iu;

/** The first strong character determines an empty field's placeholder direction. */
function placeholderDirection(placeholder = ""): "ltr" | "rtl" {
	for (const char of placeholder) {
		if (!/\p{Letter}/u.test(char)) continue;
		return /[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(char) ? "rtl" : "ltr";
	}
	return "ltr";
}

export function fieldDirectionProps({
	dir,
	type,
	name,
	autoComplete,
	inputMode,
	placeholder,
	style,
}: FieldDirectionOptions) {
	const technical =
		technicalTypes.has(type ?? "") ||
		technicalAutocomplete.test(autoComplete ?? "") ||
		technicalNames.test(name ?? "") ||
		["email", "url", "tel", "numeric", "decimal"].includes(inputMode ?? "");
	return {
		dir: dir ?? (technical ? "ltr" : "auto"),
		style: { "--field-placeholder-direction": placeholderDirection(placeholder), ...style } as CSSProperties,
	};
}
