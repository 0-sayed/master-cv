import { readFile } from "node:fs/promises";
import { expect, it } from "vite-plus/test";
import { setupI18n } from "@lingui/core";
import { formatter } from "@lingui/format-po";
import { compileMessageOrThrow } from "@lingui/message-utils/compileMessage";
import { generateMessageId } from "@lingui/message-utils/generateMessageId";

const sources = [
	"src/dialogs/auth/",
	"src/features/settings/account/",
	"src/features/settings/privacy/",
	"src/features/help/",
	"src/features/auth/errors",
	"src/features/auth/pages/verify-2fa",
	"src/routes/email-change",
	"src/routes/deletion-requested",
	"src/routes/help",
	"src/routes/dashboard/settings/",
	"src/features/settings/root",
	"src/features/documents/trash-",
];
it("every extracted account, privacy and recovery message has an Arabic translation", async () => {
	const parse = async (locale: "ar-SA" | "en-US") =>
		formatter().parse(await readFile(new URL(`../../apps/web/locales/${locale}.po`, import.meta.url), "utf8"), {
			locale,
			sourceLocale: "en-US",
			filename: `${locale}.po`,
		});
	const source = await parse("en-US");
	const arabic = await parse("ar-SA");
	const missing = Object.entries(source)
		.filter(
			([id, entry]) =>
				!entry.obsolete &&
				entry.origin?.some(([path]) => sources.some((source) => path.startsWith(source))) &&
				!arabic[id]?.translation?.trim(),
		)
		.map(([, entry]) => entry.message);
	expect(missing).toEqual([]);
});

it.each([
	[0, "الحذف اليوم"],
	[1, "يوم واحد حتى الحذف"],
	[2, "يومان حتى الحذف"],
	[3, "3 أيام حتى الحذف"],
	[10, "10 أيام حتى الحذف"],
	[11, "11 يومًا حتى الحذف"],
	[30, "30 يومًا حتى الحذف"],
	[100, "100 يوم حتى الحذف"],
])("renders Arabic retention for %i days with Latin digits", async (days, expected) => {
	const catalog = await formatter().parse(
		await readFile(new URL("../../apps/web/locales/ar-SA.po", import.meta.url), "utf8"),
		{ locale: "ar-SA", sourceLocale: "en-US", filename: "ar-SA.po" },
	);
	const id = generateMessageId(
		"{days, plural, one {Deletes in # day} other {Deletes in # days}}",
		"trash.retention.remaining",
	);
	const translation = catalog[id]?.translation;
	if (!translation) throw new Error("Missing Arabic retention message");
	const i18n = setupI18n({
		locale: "ar-SA",
		locales: "ar-SA-u-nu-latn",
		messages: { "ar-SA": { [id]: compileMessageOrThrow(translation) } },
	});
	expect(i18n._(id, { days })).toBe(expected);
});
