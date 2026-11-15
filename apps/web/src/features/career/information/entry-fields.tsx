import type { EntryOption } from "@reactive-resume/schema/resume/entry-options";
import { msg, t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useId, useState } from "react";
import {
	findEntryOption,
	languageOptions,
	fluencyOptions,
	skillOptions,
} from "@reactive-resume/schema/resume/entry-options";
import {
	ComboboxRoot,
	ComboboxInput,
	ComboboxContent,
	ComboboxList,
	ComboboxItem,
	ComboboxEmpty,
	ComboboxTrigger,
} from "@reactive-resume/ui/components/combobox";
import { Input } from "@reactive-resume/ui/components/input";
import { InputGroupAddon, InputGroupButton } from "@reactive-resume/ui/components/input-group";
import { Label } from "@reactive-resume/ui/components/label";
import { Combobox } from "@/components/ui/combobox";

const labels = {
	Arabic: msg`Arabic`,
	English: msg`English`,
	French: msg`French`,
	Urdu: msg`Urdu`,
	Hindi: msg`Hindi`,
	Spanish: msg`Spanish`,
	German: msg`German`,
	Turkish: msg`Turkish`,
	Persian: msg`Persian`,
	Chinese: msg`Chinese`,
	Japanese: msg`Japanese`,
	Korean: msg`Korean`,
	Italian: msg`Italian`,
	Portuguese: msg`Portuguese`,
	Russian: msg`Russian`,
	Bengali: msg`Bengali`,
	Indonesian: msg`Indonesian`,
	Malay: msg`Malay`,
	Tagalog: msg`Tagalog`,
	Swahili: msg`Swahili`,
	Elementary: msg`Elementary`,
	"Limited working": msg`Limited working`,
	"Professional working": msg`Professional working`,
	"Full professional": msg`Full professional`,
	"Native or bilingual": msg`Native or bilingual`,
	Beginner: msg`Beginner`,
	Intermediate: msg`Intermediate`,
	Advanced: msg`Advanced`,
	Expert: msg`Expert`,
};
function useOptions(options: EntryOption[]) {
	const { i18n } = useLingui();
	return options.map((option) => ({
		value: option.en,
		label: i18n._(labels[option.en as keyof typeof labels]),
		keywords: [option.en, option.ar],
	}));
}
type EntryFieldProps = {
	value: string;
	onChange: (value: string, level: number) => void;
	label: string;
	name?: string;
	id?: string;
	required?: boolean;
	autoFocus?: boolean | undefined;
};

/** An editable combobox: typing an unlisted language is itself a valid value. */
export function LanguageField({ value, onChange, label, name, id, required, autoFocus }: EntryFieldProps) {
	const generatedId = useId();
	const inputId = id ?? generatedId;
	const { i18n } = useLingui();
	const options = useOptions(languageOptions);
	const selected = findEntryOption(value, languageOptions);
	const display = selected ? i18n._(labels[selected.en as keyof typeof labels]) : value;
	const [query, setQuery] = useState<{ value: string; text: string } | null>(null);
	const text = query?.value === value ? query.text : display;
	const items = options.filter((option) =>
		[option.label, ...option.keywords].some((word) =>
			word.toLocaleLowerCase().includes((query?.value === value ? query.text : "").toLocaleLowerCase()),
		),
	);
	return (
		<div className="grid min-w-0 gap-2">
			<Label htmlFor={inputId}>{label}</Label>
			<ComboboxRoot
				items={items.map((item) => item.value)}
				itemToStringLabel={(item) => options.find((option) => option.value === item)?.label ?? item}
				filter={null}
				value={selected?.en ?? null}
				onValueChange={(next) => {
					if (next) {
						setQuery(null);
						onChange(next, 0);
					}
				}}
				inputValue={text}
				onInputValueChange={(next, details) => {
					if (details.reason === "input-change" || details.reason === "input-clear") {
						setQuery({ value: next, text: next });
						onChange(next, 0);
					}
				}}
			>
				<ComboboxInput
					id={inputId}
					name={name}
					required={required}
					autoFocus={autoFocus}
					dir="auto"
					maxLength={500}
					placeholder={t`Search or enter a language`}
				>
					<InputGroupAddon align="inline-end">
						<ComboboxTrigger aria-label={t`Show languages`} render={<InputGroupButton size="icon-lg" />} />
					</InputGroupAddon>
				</ComboboxInput>
				<ComboboxContent>
					<ComboboxEmpty>{t`Use the language you entered`}</ComboboxEmpty>
					<ComboboxList>
						{items.map((option) => (
							<ComboboxItem key={option.value} value={option.value}>
								{option.label}
							</ComboboxItem>
						))}
					</ComboboxList>
				</ComboboxContent>
			</ComboboxRoot>
		</div>
	);
}

type ProficiencyFieldProps = EntryFieldProps & { kind: "language" | "skill" };
export function ProficiencyField({ value, onChange, label, kind, id, name }: ProficiencyFieldProps) {
	const generatedId = useId();
	const inputId = id ?? generatedId;
	const presets = kind === "language" ? fluencyOptions : skillOptions;
	const options = useOptions(presets);
	const selected = findEntryOption(value, presets);
	const [other, setOther] = useState(false);
	const custom = other || (!!value && !selected);
	return (
		<div className="grid min-w-0 gap-2">
			<Label htmlFor={inputId}>{label}</Label>
			<Combobox
				id={inputId}
				value={custom ? "__other" : (selected?.en ?? null)}
				options={[...options, { value: "__other", label: t`Other`, keywords: [] }]}
				placeholder={t`Select a level`}
				className="w-full"
				onValueChange={(next) => {
					if (next === "__other") {
						setOther(true);
						onChange(selected ? "" : value, 0);
					} else {
						const option = presets.find((item) => item.en === next);
						if (option) {
							setOther(false);
							onChange(option.en, option.level ?? 0);
						}
					}
				}}
			/>
			{custom && (
				<>
					<Label htmlFor={`${inputId}-custom`}>{t`Custom level`}</Label>
					<Input
						id={`${inputId}-custom`}
						name={name}
						dir="auto"
						value={value}
						maxLength={500}
						placeholder={kind === "language" ? t`For example, IELTS 7.5` : t`For example, 5 years or a certificate`}
						onChange={(event) => onChange(event.target.value, 0)}
					/>
				</>
			)}
		</div>
	);
}
