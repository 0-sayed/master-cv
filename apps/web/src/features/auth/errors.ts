import { t } from "@lingui/core/macro";

/** Codes are stable API contracts; server exception text is never product copy. */
export function authErrorMessage(
	code: string | undefined,
	fallback = t`We could not complete this request. Please try again.`,
): string {
	switch (code) {
		case "INVALID_PASSWORD":
		case "INCORRECT_PASSWORD":
			return t`Check your current password, then try again.`;
		case "INVALID_TWO_FACTOR_CODE":
		case "INVALID_CODE":
		case "INVALID_BACKUP_CODE":
		case "OTP_HAS_EXPIRED":
			return t`Check your authenticator code, then try again.`;
		case "SESSION_NOT_FRESH":
		case "SESSION_EXPIRED":
		case "UNAUTHORIZED":
			return t`Sign in again, then retry this action.`;
		case "INVALID_EMAIL_OR_PASSWORD":
		case "INVALID_USERNAME_OR_PASSWORD":
			return t`Check your email and password, then try again.`;
		case "EMAIL_NOT_VERIFIED":
			return t`Verify your email before signing in.`;
		case "USER_ALREADY_EXISTS":
		case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
			return t`Unable to create this account. Try signing in or use another email.`;
		case "USERNAME_IS_ALREADY_TAKEN":
			return t`This username is unavailable. Choose another.`;
		case "TOO_MANY_REQUESTS":
			return t`Please wait before trying again.`;
		case "INVALID_TOKEN":
		case "TOKEN_EXPIRED":
			return t`This link is invalid or expired. Request a new link.`;
		default:
			return fallback;
	}
}

/** Account surfaces accept codes only, including thrown network failures. */
export function accountErrorMessage(error: unknown): string {
	const code =
		typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
			? error.code
			: undefined;
	return authErrorMessage(code);
}
