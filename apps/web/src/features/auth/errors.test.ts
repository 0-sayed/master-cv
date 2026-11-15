import { describe, expect, it } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { accountErrorMessage, authErrorMessage } from "./errors";
import { authSearchSchema } from "./redirect";
import { getUiLocaleMessages } from "@/libs/locale";

describe("auth recovery", () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	it("allows only known recovery notices", () => {
		expect(authSearchSchema.parse({ reason: "passwordChanged" }).reason).toBe("passwordChanged");
		expect(authSearchSchema.parse({ reason: "<script>token</script>" }).reason).toBeUndefined();
	});
	it("localizes known errors and never displays backend text", () => {
		expect(authErrorMessage("INVALID_EMAIL_OR_PASSWORD")).toContain("password");
		expect(authErrorMessage("database password=secret")).not.toContain("secret");
		expect(authErrorMessage("TOO_MANY_REQUESTS")).toContain("wait");
	});
});

for (const [code, expected] of [
	["INVALID_PASSWORD", "Check your current password, then try again."],
	["INVALID_TWO_FACTOR_CODE", "Check your authenticator code, then try again."],
	["INVALID_CODE", "Check your authenticator code, then try again."],
	["SESSION_NOT_FRESH", "Sign in again, then retry this action."],
	["TOO_MANY_REQUESTS", "Please wait before trying again."],
	["UNKNOWN_CODE", "We could not complete this request. Please try again."],
] as const) {
	it(`maps ${code} without exposing provider text`, () => {
		i18n.loadAndActivate({ locale: "en-US", messages: {} });
		expect(authErrorMessage(code)).toBe(expected);
	});
}
it("never renders thrown transport text, strings or malformed auth errors", () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	for (const error of [
		new Error("PROVIDER_SECRET"),
		"PROVIDER_SECRET",
		{ message: "PROVIDER_SECRET" },
		{ code: 42 },
		null,
	]) {
		expect(accountErrorMessage(error)).toBe("We could not complete this request. Please try again.");
	}
});

for (const locale of ["ar-SA", "en-US"] as const) {
	it(`${locale} maps account codes and hides provider details across all failure shapes`, async () => {
		i18n.loadAndActivate(await getUiLocaleMessages(locale));
		for (const code of [
			"INVALID_PASSWORD",
			"INVALID_TWO_FACTOR_CODE",
			"INVALID_CODE",
			"INVALID_BACKUP_CODE",
			"OTP_HAS_EXPIRED",
			"SESSION_NOT_FRESH",
			"SESSION_EXPIRED",
			"UNAUTHORIZED",
			"TOO_MANY_REQUESTS",
			"NEW_PROVIDER_CODE",
		]) {
			const message = accountErrorMessage({ code, message: "PRIVATE_PROVIDER_DETAIL" });
			expect(message).not.toContain("PRIVATE_PROVIDER_DETAIL");
			if (locale === "ar-SA") expect(message).not.toMatch(/[A-Za-z]/);
			else expect(message).toMatch(/[A-Za-z]/);
		}
		expect(accountErrorMessage(new Error("PRIVATE_PROVIDER_DETAIL"))).toBe(
			locale === "ar-SA"
				? "تعذر إكمال هذا الطلب. حاول مجددًا."
				: "We could not complete this request. Please try again.",
		);
	});
}
