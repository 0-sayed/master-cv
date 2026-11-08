import type { CompiledMessage, CompiledIcuChoices } from "@lingui/message-utils/compileMessage";
import { compileMessageOrThrow } from "@lingui/message-utils/compileMessage";
import { generateMessageId } from "@lingui/message-utils/generateMessageId";

const locales = ["ar-SA", "en-US"] as const;

export type CopyContractInput = {
	deck: {
		entries: CopyEntry[];
		screens?: Record<string, { strings: string[] }>;
		states?: Record<string, { strings: string[] }>;
		dialogs?: Record<string, { strings: string[] }>;
		components?: Record<string, { strings: string[] }>;
		messages?: Record<string, string[]>;
	};
	catalogs: Record<"ar-SA" | "en-US", Record<string, CatalogMessage>>;
	surfaces: CopySurface[];
};

type CopyEntry = {
	key: string;
	messages: Record<"ar-SA" | "en-US", string>;
	context: { surfaces: string[] };
	interpolations: { name: string; type: string }[];
	lingui: { msgid: string; msgctxt: string; runtimeId: string };
};

type CatalogMessage = {
	message?: string | undefined;
	context?: string | undefined;
	translation?: string | undefined;
	obsolete?: boolean | undefined;
	origin?: [string, (number | undefined)?][] | undefined;
};

type CopySurface = {
	id: string;
	sources: string[];
	excludeSources?: string[];
	keys: string[];
	status: "active" | "off";
	owner: string;
	gate: string | null;
};

export type CopyDiagnostic = { key: string; code: string; surface: string; message: string };

/** Qualifies delivered bindings only; the full contract audit remains a separate release check. */
export function validateCopyBindings(input: CopyContractInput): CopyDiagnostic[] {
	const keys = new Set(
		input.surfaces.filter((surface) => surface.status === "active").flatMap((surface) => surface.keys),
	);
	if (!keys.size)
		return [{ key: "", code: "empty-binding-scope", surface: "inventory", message: "No active bindings to qualify." }];
	const entries = input.deck.entries.filter((entry) => keys.has(entry.key));
	const ids = new Set(entries.map((entry) => entry.lingui.runtimeId));
	const selectCatalog = (locale: "ar-SA" | "en-US") =>
		Object.fromEntries(Object.entries(input.catalogs[locale]).filter(([id]) => ids.has(id)));
	return validateCopyContract({
		...input,
		deck: { ...input.deck, entries },
		catalogs: { "ar-SA": selectCatalog("ar-SA"), "en-US": selectCatalog("en-US") },
	});
}

/** Validates metadata and actual extracted catalogs; never substitutes fallback translations. */
export function validateCopyContract(input: CopyContractInput): CopyDiagnostic[] {
	const diagnostics: CopyDiagnostic[] = [];
	const report = (key: string, code: string, surface: string, message: string) => {
		diagnostics.push({ key, code, surface, message });
	};
	const entries = new Map<string, CopyEntry>();
	const byRuntime = new Map<string, CopyEntry>();
	for (const entry of input.deck.entries) {
		if (entries.has(entry.key)) report(entry.key, "duplicate-key", "deck", "Semantic key is repeated.");
		entries.set(entry.key, entry);
		byRuntime.set(entry.lingui.runtimeId, entry);
		if (
			entry.lingui.msgid !== entry.messages["en-US"] ||
			generateMessageId(entry.lingui.msgid, entry.lingui.msgctxt) !== entry.lingui.runtimeId
		) {
			report(entry.key, "stale-identity", "deck", "Source/context/compiled ID differ from Lingui's identity.");
		}
		for (const reference of entry.context.surfaces) {
			const colon = reference.indexOf(":");
			const category = reference.slice(0, colon);
			const name = reference.slice(colon + 1);
			const groups: Record<string, Record<string, { strings: string[] }> | undefined> = {
				screens: input.deck.screens,
				states: input.deck.states,
				dialogs: input.deck.dialogs,
				components: input.deck.components,
			};
			const keys = category === "messages" ? input.deck.messages?.[name] : groups[category]?.[name]?.strings;
			if (!keys?.includes(entry.key))
				report(entry.key, "dangling-surface", reference, "Surface does not reference this key.");
		}
		const args = new Map<string, Set<string>>();
		for (const locale of locales) {
			const text = entry.messages[locale];
			if (!text.trim()) report(entry.key, "empty-copy", "deck", `${locale} text is empty.`);
			try {
				const compiled = compileMessageOrThrow(text);
				const found = new Map<string, Set<string>>();
				visitArguments(compiled, (name, type, choices) => {
					const types = found.get(name) ?? new Set<string>();
					types.add(type);
					found.set(name, types);
					if (type === "plural") {
						const required = locale === "ar-SA" ? ["zero", "one", "two", "few", "many", "other"] : ["one", "other"];
						if (required.some((category) => !choices || !(category in choices)))
							report(
								entry.key,
								"plural-categories",
								"deck",
								`${locale} requires ${required.join("/")} branches for ${name}.`,
							);
					}
				});
				args.set(locale, new Set([...found].map(([name, types]) => `${name}:${[...types].sort().join(",")}`)));
				const declared = new Map(entry.interpolations.map((arg) => [arg.name, arg.type]));
				if (found.size !== declared.size || [...found.keys()].some((name) => !declared.has(name)))
					report(
						entry.key,
						"placeholder-mismatch",
						"deck",
						`${locale} arguments differ from declared interpolation names.`,
					);
				for (const [name, types] of found) {
					const declaredType = declared.get(name);
					if (
						[...types].some((type) => ["plural", "selectordinal", "number"].includes(type)) &&
						!["integer", "number", "decimal", "plural"].includes(declaredType ?? "")
					)
						report(
							entry.key,
							"placeholder-type",
							"deck",
							`${locale} ${name} needs a numeric argument, declared ${declaredType ?? "missing"}.`,
						);
					if (types.has("date") && declaredType !== "date")
						report(entry.key, "placeholder-type", "deck", `${locale} ${name} needs a date argument.`);
				}
			} catch (error) {
				report(
					entry.key,
					"invalid-icu",
					"deck",
					`${locale}: ${error instanceof Error ? error.message : "Invalid ICU"}`,
				);
			}
		}
		const ar = args.get("ar-SA");
		const en = args.get("en-US");
		if (ar && en && (ar.size !== en.size || [...ar].some((value) => !en.has(value))))
			report(entry.key, "placeholder-mismatch", "deck", "AR/EN argument names/types differ.");
	}

	for (const surface of input.surfaces) {
		if (surface.status === "off") continue;
		const belongsToSurface = (message: CatalogMessage) =>
			message.origin?.some(
				([path]) =>
					surface.sources.some((source) => path.startsWith(source)) &&
					!surface.excludeSources?.some((source) => path.startsWith(source)),
			);
		for (const key of surface.keys) {
			const entry = entries.get(key);
			if (!entry) {
				report(key, "missing-deck-message", surface.id, "Active surface key is absent from the deck.");
				continue;
			}
			for (const locale of locales) {
				const message = input.catalogs[locale][entry.lingui.runtimeId];
				if (!message || message.obsolete || !belongsToSurface(message)) {
					report(
						key,
						"missing-runtime-message",
						surface.id,
						`${locale} identity has no active extracted source on this surface.`,
					);
					continue;
				}
				if (message.message !== entry.lingui.msgid || (message.context ?? "") !== entry.lingui.msgctxt)
					report(key, "stale-identity", surface.id, `${locale} catalog source/context differ from the deck.`);
				if (!message.translation?.trim())
					report(key, "empty-translation", surface.id, `${locale} would rely on fallback copy.`);
				else if (message.translation !== entry.messages[locale])
					report(key, "translation-mismatch", surface.id, `${locale} runtime text differs from the deck.`);
			}
		}
		for (const [id, message] of Object.entries(input.catalogs["en-US"])) {
			if (message.obsolete || !belongsToSurface(message)) continue;
			const entry = byRuntime.get(id);
			if (!entry || !surface.keys.includes(entry.key))
				report(
					id,
					"unmapped-active-message",
					surface.id,
					`No active deck mapping for ${JSON.stringify(message.message)} (${message.origin?.map(([path]) => path).join(", ")}).`,
				);
		}
	}
	return diagnostics;
}

function visitArguments(
	message: CompiledMessage,
	visit: (name: string, type: string, choices?: CompiledIcuChoices) => void,
) {
	for (const token of message) {
		if (typeof token === "string") continue;
		const [name, type = "string", format] = token;
		if (["plural", "select", "selectordinal"].includes(type) && typeof format === "object" && format !== null) {
			const choices = format as CompiledIcuChoices;
			visit(name, type, choices);
			for (const branch of Object.values(choices)) if (Array.isArray(branch)) visitArguments(branch, visit);
		} else visit(name, type);
	}
}
