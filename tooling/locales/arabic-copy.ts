type Message = { message?: string | undefined; translation?: string | undefined; obsolete?: boolean | undefined };

// Consent, completed states and prose are not action labels. Detect actions by their English verb.
const action =
	/^(?:Add|Ask|Change|Check|Clear|Close|Copy|Create|Crop|Delete|Discard|Download|Edit|Export|Format|Go|Hide|Ignore|Import|Improve|Keep|Leave|Link|Move|Open|Print|Redo|Reject|Remove|Replace|Require|Reset|Restore|Retry|Save|Search|Select|Send|Share|Show|Sign|Sort|Start|Suggest|Switch|Test|Undo|Unlink|Update|Upload|Use|View|Write)(?:\s|$|…)/u;
// These stems distinguish finite verbs from verbal nouns beginning with ت, e.g. تغيير/تصدير/تسجيل.
const finiteVerb =
	/^(?:[يت]تغير|[يت]مسح|[يت]صدر|[يت]حفظ|[يت]ضيف|[يت]شارك|[يت]تجاهل|[يت]حسن|[يت]رفض|[يت]ستبدل|[يت]عرض|[يت]طلب|[يت]دعم|[يت]بدأ|[يت]كتب|[يت]نزل|[يت]رفع|[يت]فتح|[يت]غلق|[يت]حذف|[يت]نسخ|[يت]عيد|[يت]حمل)$/u;

export function arabicCopyViolations(catalog: Record<string, Message>): string[] {
	const violations: string[] = [];
	for (const [id, entry] of Object.entries(catalog)) {
		if (entry.obsolete) continue;
		const source = entry.message ?? "";
		const text = entry.translation ?? "";
		const plain = text
			.replace(/[\u064B-\u065F\u0670]/gu, "")
			.replace(/(?:…|\.{3})$/u, "")
			.trim();
		if (action.test(source) && !/\s/u.test(plain) && finiteVerb.test(plain))
			violations.push(`${id}: action must use a verbal noun (${text})`);
		// "documentation" and markup tags/punctuation marks are distinct concepts, not glossary exceptions.
		if (/\bdocuments?\b/iu.test(source) && /(?:وثيقة|وثائق)/u.test(text))
			violations.push(`${id}: document must use مستند`);
		if (/خطاب (?:تعريف[ي]?|تغطية|الغلاف)/u.test(text)) violations.push(`${id}: cover letter must use خطاب تقديم`);
		if (
			/\btags?\b/iu.test(source) &&
			!/\b(?:HTML|XML|markup|closing|opening)\b/iu.test(source) &&
			/علام[ةات]/u.test(text)
		)
			violations.push(`${id}: tag must use وسم`);
		if (/\bproviders?\b/iu.test(source) && /(?:موف[ّ]?ر|مقد[ّ]?م[يو]? الخدمات|مقد[ّ]?م خدمات)/u.test(text))
			violations.push(`${id}: provider must use مزوّد`);
		if (/التقديمات/u.test(text)) violations.push(`${id}: applications must use طلبات التقديم`);
		if (source === "Applications" && text !== "طلبات التقديم")
			violations.push(`${id}: navigation must use طلبات التقديم`);
		if (/\brecruiters?\b/iu.test(source) && /مجند/u.test(text))
			violations.push(`${id}: recruiter must use مسؤول توظيف`);
	}
	return violations;
}
