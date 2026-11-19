import type { EditorIdentity } from "../store";
import type { CheckIssue } from "./issues";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { prepareFix, type FixChoice } from "./fix-preview";

export function groupFindings<T>(items: readonly T[], rule: (item: T) => string): [T, ...T[]][] {
	const groups = new Map<string, [T, ...T[]]>();
	for (const item of items) {
		const key = rule(item);
		const group = groups.get(key);
		if (group) group.push(item);
		else groups.set(key, [item]);
	}
	return [...groups.values()];
}

export function prepareIssueFixes(identity: EditorIdentity, data: ResumeData, issues: readonly CheckIssue[]) {
	const fixes = issues.flatMap((issue) => (issue.fix.kind === "apply" ? [issue.fix] : []));
	return prepareFix(
		identity,
		data,
		(draft) => {
			for (const fix of fixes) fix.apply(draft);
		},
		fixes.flatMap((fix) => (fix.choice ? [fix.choice] : [])),
	);
}

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
function personalEmails(data: ResumeData): string[] {
	const emails = [data.basics.email, ...data.basics.customFields.flatMap((field) => [field.text, field.link])].flatMap(
		(value) => value.match(EMAIL) ?? [],
	);
	return [...new Map(emails.map((email) => [email.toLowerCase(), email])).values()];
}

export function primaryEmailChoice(data: ResumeData): FixChoice | undefined {
	const options = personalEmails(data);
	const [first, second] = options;
	if (!first || !second) return;
	return {
		kind: "email",
		label: options.join(" · "),
		options,
		value: first,
		apply: (draft, value) => {
			if (!options.includes(value)) return;
			draft.basics.email = value;
			draft.basics.customFields = draft.basics.customFields.flatMap((field) => {
				if (![field.text, field.link].some((text) => (text.match(EMAIL) ?? []).length)) return [field];
				const text = field.text.replace(EMAIL, "").replace(/^[\s|·,;]+|[\s|·,;]+$/g, "");
				const link = field.link
					.replace(/^mailto:/i, "")
					.replace(EMAIL, "")
					.trim();
				return text || link ? [{ ...field, text, link }] : [];
			});
		},
	};
}
