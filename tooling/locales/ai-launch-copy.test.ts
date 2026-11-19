import { readFile } from "node:fs/promises";
import { expect, it } from "vite-plus/test";
import { formatter } from "@lingui/format-po";
import { type CopyContractInput, validateCopyBindings } from "./copy-contract";

it("binds AI launch recovery and local interview availability to Arabic and English catalogs", async () => {
	const deck = JSON.parse(
		await readFile(new URL("../../Planning/context/design/copy-deck.json", import.meta.url), "utf8"),
	) as CopyContractInput["deck"];
	const entries = deck.entries.filter(
		(entry) => entry.key.startsWith("review.launch.") || entry.key === "reviewGuide.ai.interview.location",
	);
	expect(entries).toHaveLength(10);
	const parse = async (locale: "ar-SA" | "en-US") =>
		formatter().parse(await readFile(new URL(`../../apps/web/locales/${locale}.po`, import.meta.url), "utf8"), {
			locale,
			sourceLocale: "en-US",
			filename: `${locale}.po`,
		});
	const [ar, en] = await Promise.all([parse("ar-SA"), parse("en-US")]);
	expect(
		validateCopyBindings({
			deck: { entries },
			surfaces: [
				{
					id: "ai-launch",
					status: "active",
					sources: ["src/features/assistant/copy.generated.ts", "src/features/ats-guide/ai-features.ts"],
					keys: entries.map((entry) => entry.key),
					owner: "B-C04",
					gate: null,
				},
			],
			catalogs: { "ar-SA": ar, "en-US": en },
		}),
	).toEqual([]);
});
