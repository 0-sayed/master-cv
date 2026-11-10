import { t } from "@lingui/core/macro";

/** Codes are stable API contracts; server exception text is never product copy. */
export function authErrorMessage(code: string | undefined): string {
	switch (code) {
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
			return t`We could not complete this request. Please try again.`;
	}
}
