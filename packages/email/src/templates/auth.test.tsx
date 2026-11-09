import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vite-plus/test";
import { createElement } from "react";
import { render } from "react-email";
import { authMessages } from "../auth-messages.generated";
import { ResetPasswordEmail, VerifyEmail, VerifyEmailChange } from "./auth";

describe("transactional auth mail", () => {
	it("is derived from the copy deck with identical interpolation names", async () => {
		const deck = JSON.parse(
			await readFile(`${process.cwd()}/../../Planning/context/design/copy-deck.json`, "utf8"),
		) as { entries: Array<{ key: string; messages: unknown }> };
		expect(authMessages).toEqual(
			Object.fromEntries(
				deck.entries
					.filter(({ key }) => /^email\.(verification|reset|emailChange|passwordResetNotice)\./.test(key))
					.map(({ key, messages }) => [key, messages]),
			),
		);
		for (const messages of Object.values(authMessages))
			expect(messages["ar-SA"].match(/\{\w+\}/g)?.sort() ?? []).toEqual(
				messages["en-US"].match(/\{\w+\}/g)?.sort() ?? [],
			);
	});
	it.each(["ar-SA", "en-US"] as const)("renders complete verification copy in %s", async (locale) => {
		const element = createElement(VerifyEmail, { url: "https://master.example.test/verify", locale });
		for (const message of await Promise.all([render(element), render(element, { plainText: true })])) {
			expect(message).toContain(authMessages["email.verification.intro"][locale]);
			expect(message).not.toMatch(/\{\w+\}/);
		}
	});
	it.each(["ar-SA", "en-US"] as const)("renders %s without external assets and escapes addresses", async (locale) => {
		for (const template of [VerifyEmail, ResetPasswordEmail, VerifyEmailChange]) {
			const html = await render(
				createElement(template, {
					url: "https://master.example.test/verify?token=synthetic",
					locale,
					previousEmail: "<img src=x>@example.test",
					newEmail: "new@example.test",
				}),
			);
			expect(html).toContain(`lang="${locale}"`);
			expect(html).toContain(`dir="${locale === "ar-SA" ? "rtl" : "ltr"}"`);
			expect(html).toContain("Master CV");
			expect(html).not.toMatch(/fonts\.google|rxresu|<img|<script/);
			expect(html).toContain("https://master.example.test/verify?token=synthetic");
		}
	});
});
