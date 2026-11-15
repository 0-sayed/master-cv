/** Both browser runtimes deliver only to Playwright's loopback synthetic SMTP sink. */
export function syntheticMailEnvironment(parent) {
	return {
		SMTP_HOST: "127.0.0.1",
		SMTP_PORT: parent.E2E_SMTP_PORT ?? String(Number.parseInt(parent.PORT ?? "3000", 10) + 3),
		SMTP_SECURE: "false",
		SMTP_USER: "synthetic",
		SMTP_PASS: "synthetic",
		SMTP_FROM: "Master CV <mail@example.test>",
	};
}
