/** Page references in sentences only; compact labels and counts keep their digits. */
export function formatPageNumberInSentence(page: number, locale: string): string {
	return locale === "ar-SA" ? (arabicPageOrdinals[page - 1] ?? String(page)) : String(page);
}

const arabicPageOrdinals = [
	"الأولى",
	"الثانية",
	"الثالثة",
	"الرابعة",
	"الخامسة",
	"السادسة",
	"السابعة",
	"الثامنة",
	"التاسعة",
	"العاشرة",
];
