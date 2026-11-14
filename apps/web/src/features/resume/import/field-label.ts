import { t } from "@lingui/core/macro";

export function fieldLabel(field: string) {
	const labels: Record<string, string> = {
		company: t`Company`,
		position: t`Position`,
		location: t({ context: "workplace", message: "Location" }),
		dates: t`Dates`,
		period: t`Dates`,
		description: t`Description`,
		school: t`School`,
		degree: t`Degree`,
		area: t`Area of study`,
		grade: t`Grade`,
		name: t`Name`,
		headline: t`Headline`,
		phone: t`Phone`,
		proficiency: t`Proficiency`,
		language: t`Language`,
		fluency: t`Fluency`,
		title: t`Title`,
		issuer: t`Issuer`,
		network: t`Network`,
		username: t`Username`,
		website: t`Link`,
		keywords: t`Keywords`,
		roles: t`Roles`,
		organization: t`Organization`,
		awarder: t`Awarder`,
		publisher: t`Publisher`,
		content: t`Content`,
	};
	return labels[field] ?? field;
}
