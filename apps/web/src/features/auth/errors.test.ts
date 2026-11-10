import { describe, expect, it } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { authErrorMessage } from "./errors";
import { authSearchSchema } from "./redirect";

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
