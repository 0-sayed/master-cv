import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const envMock = vi.hoisted(() => ({
	SMTP_HOST: undefined as string | undefined,
	SMTP_PORT: 587,
	SMTP_USER: undefined as string | undefined,
	SMTP_PASS: undefined as string | undefined,
	SMTP_FROM: undefined as string | undefined,
	SMTP_SECURE: false,
}));

const sendMail = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));
const createTransport = vi.hoisted(() => vi.fn(() => ({ sendMail })));

vi.mock("@reactive-resume/env/server", () => ({ env: envMock }));
vi.mock("nodemailer", () => ({
	default: { createTransport },
	createTransport,
}));
vi.mock("react-email", () => ({
	render: async (_node: unknown, opts?: { plainText?: boolean }) =>
		opts?.plainText ? "plain text body" : "<p>html body</p>",
}));

const { sendEmail, sendPrivacyEmail } = await import("./transport");

const fakeReact = { $$typeof: Symbol.for("react.element") } as unknown as React.ReactElement;

const resetEnv = () => {
	envMock.SMTP_HOST = undefined;
	envMock.SMTP_USER = undefined;
	envMock.SMTP_PASS = undefined;
	envMock.SMTP_FROM = undefined;
	createTransport.mockClear();
	sendMail.mockClear();
};
describe("sendEmail", () => {
	const originalNodeEnv = process.env.NODE_ENV;

	afterEach(() => {
		process.env.NODE_ENV = originalNodeEnv;
	});

	it("fails safely in production when SMTP is not configured", async () => {
		resetEnv();
		process.env.NODE_ENV = "production";
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
		await expect(sendEmail({ to: "user@example.com", subject: "Reset password", react: fakeReact })).rejects.toThrow(
			"Email could not be delivered. Please try again.",
		);
		expect(infoSpy).not.toHaveBeenCalled();
		infoSpy.mockRestore();
	});

	it("skips email send and logs with body in development when SMTP is not configured", async () => {
		resetEnv();
		process.env.NODE_ENV = "development";
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
		await expect(
			sendEmail({ to: "user@example.com", subject: "Reset password", react: fakeReact }),
		).resolves.toBeUndefined();
		expect(infoSpy).toHaveBeenCalledWith("SMTP not configured; skipping email send.", {
			to: "user@example.com",
			subject: "Reset password",
			text: "plain text body",
			html: "<p>html body</p>",
		});
		infoSpy.mockRestore();
	});

	it("returns a retryable error without sensitive SMTP details", async () => {
		resetEnv();
		process.env.NODE_ENV = "production";
		envMock.SMTP_HOST = "smtp.example.com";
		envMock.SMTP_USER = "user";
		envMock.SMTP_PASS = "pass";
		envMock.SMTP_FROM = "noreply@example.com";
		sendMail.mockRejectedValueOnce(new Error("SMTP rejected password=secret reset-token=private"));

		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		await expect(sendEmail({ to: "a@b.com", subject: "hi", react: fakeReact })).rejects.toThrow(
			"Email could not be delivered. Please try again.",
		);
		expect(errorSpy).toHaveBeenCalledExactlyOnceWith("There was an error sending mail.");
		errorSpy.mockRestore();
	});
});

describe("privacy delivery", () => {
	it.each(["a@b.test,c@d.test", "a@b.test;c@d.test", "Reader <a@b.test>", "a@b.test\r\nBcc:c@d.test"])(
		"rejects recipient expansion: %s",
		async (to) => {
			resetEnv();
			await expect(sendPrivacyEmail({ to, subject: "Private", react: fakeReact, key: "receipt" })).rejects.toThrow(
				"PRIVACY_MAIL_RECIPIENT_INVALID",
			);
			expect(sendMail).not.toHaveBeenCalled();
		},
	);
	it.each([
		[550, "PRIVACY_MAIL_REJECTED"],
		[450, "PRIVACY_MAIL_RETRY_REQUIRED"],
	])("classifies SMTP %s without exposing mail content", async (responseCode, expected) => {
		resetEnv();
		envMock.SMTP_HOST = "smtp.example.test";
		envMock.SMTP_USER = "synthetic";
		envMock.SMTP_PASS = "synthetic";
		envMock.SMTP_FROM = "sender@example.test";
		sendMail.mockRejectedValueOnce(Object.assign(new Error("private SMTP details"), { responseCode }));
		await expect(
			sendPrivacyEmail({ to: "owner@example.test", subject: "Private", react: fakeReact, key: "receipt" }),
		).rejects.toThrow(expected);
	});
});
