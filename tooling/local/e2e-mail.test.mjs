import { expect, it } from "vite-plus/test";
import { syntheticMailEnvironment } from "./e2e-mail.mjs";

it.each([
	[{}, "3003"],
	[{ PORT: "3030" }, "3033"],
	[{ PORT: "3030", E2E_SMTP_PORT: "3043" }, "3043"],
])("selects the Playwright SMTP sink for %j", (parent, port) => {
	expect(syntheticMailEnvironment(parent).SMTP_PORT).toBe(port);
});

it("keeps inherited provider configuration out of both synthetic runtimes", () => {
	expect(syntheticMailEnvironment({ SMTP_HOST: "remote.invalid", SMTP_USER: "private", SMTP_PASS: "private" })).toEqual(
		{
			SMTP_HOST: "127.0.0.1",
			SMTP_PORT: "3003",
			SMTP_SECURE: "false",
			SMTP_USER: "synthetic",
			SMTP_PASS: "synthetic",
			SMTP_FROM: "Sirawise <mail@example.test>",
		},
	);
});
