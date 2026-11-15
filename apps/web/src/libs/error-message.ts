import { plural, t } from "@lingui/core/macro";
import { ORPCError } from "@orpc/client";
import { authErrorMessage } from "@/features/auth/errors";
import { getCreationLimit } from "@/features/documents/creation-error";

export function getReadableErrorMessage(error: unknown, fallback: string): string {
	// A font download failed (see `assertPdfFonts`).
	if (error instanceof Error && error.cause === "pdf-text-loss") return t`Fonts could not be loaded. Try again.`;
	if (error instanceof ORPCError && error.code === "BAD_REQUEST") {
		const data: unknown = error.data;
		if (typeof data === "object" && data !== null && "issues" in data && Array.isArray(data.issues)) {
			for (const issue of data.issues) {
				if (typeof issue !== "object" || issue === null) continue;
				if (issue.code === "too_big" && issue.origin === "file" && issue.maximum === 10 * 1024 * 1024)
					return t`File size must be less than 10MB`;
			}
		}
	}

	// Server prose is not product copy. Only stable codes select localized messages.
	if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string")
		return authErrorMessage(error.code, fallback);
	return fallback;
}

type ErrorMessageByCode = Record<string, string>;

export function getOrpcErrorMessage(
	error: unknown,
	options: {
		fallback: string;
		byCode?: ErrorMessageByCode;
	},
): string {
	if (!(error instanceof ORPCError)) return getReadableErrorMessage(error, options.fallback);
	if (error.code === "AI_CREDENTIAL_DECRYPTION_FAILED")
		return t`The saved provider key can't be decrypted. Enter the key again in Settings → AI & developer.`;

	const mappedMessage = options.byCode?.[error.code];
	if (mappedMessage) return mappedMessage;

	return getReadableErrorMessage(error, options.fallback);
}

export function getResumeErrorMessage(error: unknown): string {
	const limit = getCreationLimit(error);
	if (limit === "BASE_CV_LIMIT")
		return t`You have reached the limit for base CVs. Your existing documents remain available to edit and download.`;
	if (limit === "JOB_COPY_LIMIT") return t`You already have a job copy for this base CV. Your selections are kept.`;
	if (limit === "LANGUAGE_COPY_LIMIT")
		return t`You already have a language copy for this base CV. Your selections are kept.`;
	return getOrpcErrorMessage(error, {
		byCode: {
			RESUME_SLUG_ALREADY_EXISTS: t`A resume with this slug already exists.`,
			RESUME_LOCKED: t`This resume is locked. Unlock it first to make changes.`,
		},
		fallback: t`Something went wrong. Please try again.`,
	});
}

/** Characters no font in the resume can draw, as the PDF engine names them (`"₹" (U+20B9)`); they print as "?". */
export function getLostCharactersMessage(characters: readonly string[]): string {
	if (characters.length === 0)
		return t`Your selected font can't display some characters. They show as “?”. In Design, choose a font that has them.`;
	const list = characters.join(", ");
	return plural(characters.length, {
		one: `Your selected font can't display ${list}. It shows as “?”. In Design, choose a font that has it.`,
		other: `Your selected font can't display ${list}. They show as “?”. In Design, choose a font that has them.`,
	});
}
