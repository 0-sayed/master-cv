import { readFile } from "node:fs/promises";
import { formatter } from "@lingui/format-po";
import { type CopyContractInput, validateCopyBindings, validateCopyContract } from "./copy-contract";

const deck = JSON.parse(
	await readFile(new URL("../../Planning/context/design/copy-deck.json", import.meta.url), "utf8"),
) as CopyContractInput["deck"];
const inventory = JSON.parse(await readFile(new URL("./active-surfaces.json", import.meta.url), "utf8")) as {
	surfaces: CopyContractInput["surfaces"];
};
const parseCatalog = async (locale: "ar-SA" | "en-US") => {
	const filename = `${locale}.po`;
	return formatter().parse(await readFile(new URL(`../../apps/web/locales/${filename}`, import.meta.url), "utf8"), {
		locale,
		sourceLocale: "en-US",
		filename,
	});
};
const [arabic, english] = await Promise.all([parseCatalog("ar-SA"), parseCatalog("en-US")]);
const bindingsOnly = process.argv.includes("--bindings");
const validate = bindingsOnly ? validateCopyBindings : validateCopyContract;
const diagnostics = validate({
	deck,
	catalogs: { "ar-SA": arabic, "en-US": english },
	surfaces: inventory.surfaces,
});
if (process.argv.includes("--json")) console.log(JSON.stringify(diagnostics, null, 2));
else {
	const counts = new Map<string, number>();
	for (const diagnostic of diagnostics) counts.set(diagnostic.code, (counts.get(diagnostic.code) ?? 0) + 1);
	for (const [code, count] of counts) console.log(`${code}: ${count}`);
	for (const diagnostic of diagnostics.slice(0, 12))
		console.error(`${diagnostic.surface} / ${diagnostic.key}: ${diagnostic.message}`);
	console.log(
		`Copy ${bindingsOnly ? "bindings (not full coverage)" : "contract"}: ${diagnostics.length} diagnostics across ${inventory.surfaces.length} surfaces.`,
	);
}
if (diagnostics.length) process.exitCode = 1;
