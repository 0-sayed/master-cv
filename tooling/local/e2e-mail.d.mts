export function syntheticMailEnvironment(parent: Record<string, string | undefined>): {
	SMTP_HOST: string;
	SMTP_PORT: string;
	SMTP_SECURE: string;
	SMTP_USER: string;
	SMTP_PASS: string;
	SMTP_FROM: string;
};
