import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
const publicMessages = {
	"landing.hero.title": msg({
		message: "Write and review your CV, then download a PDF.",
		context: "landing.hero.title",
	}),
	"landing.hero.eyebrow": msg({ message: "Arabic first, ready in English", context: "landing.hero.eyebrow" }),
	"landing.hero.subtitle": msg({
		message:
			"Import your PDF, approve every suggestion, tailor it to a job, and download a PDF made for screening systems (ATS).",
		context: "landing.hero.subtitle",
	}),
	"landing.hero.startFree": msg({ message: "Start free", context: "landing.hero.startFree" }),
	"landing.hero.cta": msg({ message: "Start free", context: "landing.hero.cta" }),
	"landing.hero.reassurance": msg({
		message: "Free to start. Your documents stay private.",
		context: "landing.hero.reassurance",
	}),
	"landing.navigation.label": msg({ message: "On this page", context: "landing.navigation.label" }),
	"landing.navigation.workspace": msg({ message: "Open my workspace", context: "landing.navigation.workspace" }),
	"landing.navigation.howItWorks": msg({ message: "How it works", context: "landing.navigation.howItWorks" }),
	"landing.navigation.menu": msg({ message: "Menu", context: "landing.navigation.menu" }),
	"landing.navigation.pricing": msg({ message: "Pricing", context: "landing.navigation.pricing" }),
	"landing.live.imported": msg({ message: "Imported from PDF", context: "landing.live.imported" }),
	"landing.live.pdfReady": msg({ message: "PDF ready", context: "landing.live.pdfReady" }),
	"landing.pricing.title": msg({ message: "Start free today", context: "landing.pricing.title" }),
	"landing.pricing.body": msg({
		message: "The free plan works today. The paid plan is on the way.",
		context: "landing.pricing.body",
	}),
	"landing.pricing.free.name": msg({ message: "Free", context: "landing.pricing.free.name" }),
	"landing.pricing.free.note": msg({ message: "Everything you need to start.", context: "landing.pricing.free.note" }),
	"landing.pricing.free.cv": msg({
		message: "1 CV, with 1 version in another language and 1 copy tailored to a job",
		context: "landing.pricing.free.cv",
	}),
	"landing.pricing.free.ai": msg({
		message: "5 AI operations, such as reading your CV or improving its wording",
		context: "landing.pricing.free.ai",
	}),
	"landing.pricing.free.review": msg({
		message: "Review every suggestion before anything changes",
		context: "landing.pricing.free.review",
	}),
	"landing.pricing.free.pdf": msg({ message: "Download your CV as a PDF", context: "landing.pricing.free.pdf" }),
	"landing.pricing.paid.name": msg({ message: "Paid plan", context: "landing.pricing.paid.name" }),
	"landing.pricing.paid.note": msg({
		message: "Price and details will be announced.",
		context: "landing.pricing.paid.note",
	}),
	"landing.pricing.paid.cvs": msg({ message: "More CVs", context: "landing.pricing.paid.cvs" }),
	"landing.pricing.paid.copies": msg({
		message: "More language versions and job-tailored copies",
		context: "landing.pricing.paid.copies",
	}),
	"landing.pricing.paid.ai": msg({
		message: "A monthly allowance of AI operations",
		context: "landing.pricing.paid.ai",
	}),
	"landing.pricing.soon": msg({ message: "Coming soon", context: "landing.pricing.soon" }),
	"landing.footer.product": msg({ message: "Product", context: "landing.footer.product" }),
	"landing.footer.support": msg({ message: "Support", context: "landing.footer.support" }),
	"landing.footer.legal": msg({ message: "Legal", context: "landing.footer.legal" }),
	"landing.ats.eyebrow": msg({ message: "Screening systems (ATS)", context: "landing.ats.eyebrow" }),
	"landing.ats.title": msg({ message: "A CV screening systems can read", context: "landing.ats.title" }),
	"landing.ats.body": msg({
		message: "We check your PDF file itself and show what to fix. No pass score: no tool can promise one.",
		context: "landing.ats.body",
	}),
	"landing.ats.order": msg({
		message: "Arabic and English PDFs tested so their dates and facts are read in order",
		context: "landing.ats.order",
	}),
	"landing.ats.link": msg({ message: "Check a PDF's readability", context: "landing.ats.link" }),
	"landing.ats.panel": msg({ message: "PDF readability", context: "landing.ats.panel" }),
	"landing.ats.check.text": msg({ message: "Selectable text, not an image", context: "landing.ats.check.text" }),
	"landing.ats.check.fonts": msg({ message: "Embedded fonts that read correctly", context: "landing.ats.check.fonts" }),
	"landing.ats.check.open": msg({ message: "No password protection", context: "landing.ats.check.open" }),
	"landing.ats.check.size": msg({ message: "File under 2.5 MB", context: "landing.ats.check.size" }),
	"landing.ats.note": msg({ message: "Findings with fixes, never a score.", context: "landing.ats.note" }),
	"landing.live.readable": msg({ message: "Readable text", context: "landing.live.readable" }),
	"landing.pricing.free.label": msg({ message: "Free plan", context: "landing.pricing.free.label" }),
	"landing.pricing.free.badge": msg({ message: "Available now", context: "landing.pricing.free.badge" }),
	"landing.pricing.free.ats": msg({ message: "PDF readability check", context: "landing.pricing.free.ats" }),
	"landing.faq.ats.question": msg({ message: "Will my CV pass ATS?", context: "landing.faq.ats.question" }),
	"landing.faq.ats.answer": msg({
		message:
			"No tool can promise that. We check that your PDF's text is readable and show what to fix. Arabic parsing can vary between hiring systems.",
		context: "landing.faq.ats.answer",
	}),
	"landing.navigation.privacy": msg({ message: "Privacy", context: "landing.navigation.privacy" }),
	"landing.navigation.faq": msg({ message: "FAQ", context: "landing.navigation.faq" }),
	"landing.example.disclosure": msg({
		message: "Illustrative example with synthetic facts, not a user result or a live analysis.",
		context: "landing.example.disclosure",
	}),
	"landing.example.arabic": msg({ message: "Arabic version", context: "landing.example.arabic" }),
	"landing.example.english": msg({ message: "English version", context: "landing.example.english" }),
	"landing.example.before": msg({ message: "Original", context: "landing.example.before" }),
	"landing.example.after": msg({ message: "Suggested wording", context: "landing.example.after" }),
	"landing.example.pending": msg({ message: "Awaiting your decision", context: "landing.example.pending" }),
	"landing.example.accepted": msg({ message: "Accepted", context: "landing.example.accepted" }),
	"landing.example.language": msg({ message: "Example CV language", context: "landing.example.language" }),
	"landing.example.jobs": msg({ message: "Sample jobs", context: "landing.example.jobs" }),
	"landing.example.ownWords": msg({
		message: "In your account you add this yourself, in your own words. Nothing is filled in for you.",
		context: "landing.example.ownWords",
	}),
	"landing.example.accept": msg({ message: "Accept", context: "landing.example.accept" }),
	"landing.example.keep": msg({ message: "Keep original", context: "landing.example.keep" }),
	"landing.example.reason": msg({
		message: "It starts with the action and adds nothing you did not write.",
		context: "landing.example.reason",
	}),
	"landing.example.question": msg({
		message: "Do you have a measurable result for this work? Add it yourself if you do.",
		context: "landing.example.question",
	}),
	"landing.example.found": msg({ message: "Evidence found", context: "landing.example.found" }),
	"landing.example.partial": msg({ message: "Partial evidence", context: "landing.example.partial" }),
	"landing.example.missing": msg({ message: "No evidence yet", context: "landing.example.missing" }),
	"landing.steps.title": msg({ message: "How it works", context: "landing.steps.title" }),
	"landing.steps.subtitle": msg({
		message: "Three steps. Every decision is yours.",
		context: "landing.steps.subtitle",
	}),
	"landing.steps.add.title": msg({ message: "Add your facts", context: "landing.steps.add.title" }),
	"landing.steps.add.body": msg({
		message: "Import your PDF or write it yourself.",
		context: "landing.steps.add.body",
	}),
	"landing.steps.review.title": msg({ message: "Review the changes", context: "landing.steps.review.title" }),
	"landing.steps.review.body": msg({
		message: "Accept, edit or keep the original.",
		context: "landing.steps.review.body",
	}),
	"landing.steps.download.title": msg({ message: "Download your PDF", context: "landing.steps.download.title" }),
	"landing.steps.download.body": msg({
		message: "Check its readability, then download.",
		context: "landing.steps.download.body",
	}),
	"landing.review.eyebrow": msg({ message: "Review before anything changes", context: "landing.review.eyebrow" }),
	"landing.review.title": msg({ message: "No invention. Just clarity.", context: "landing.review.title" }),
	"landing.review.body": msg({
		message: "Suggestions only rephrase what you wrote. You decide.",
		context: "landing.review.body",
	}),
	"landing.tailor.title": msg({ message: "A version for every job", context: "landing.tailor.title" }),
	"landing.tailor.body": msg({
		message: "Pick a job and see what your CV already supports. No pass score.",
		context: "landing.tailor.body",
	}),
	"landing.languages.eyebrow": msg({ message: "Arabic and English", context: "landing.languages.eyebrow" }),
	"landing.languages.title": msg({ message: "Two languages. One set of facts.", context: "landing.languages.title" }),
	"landing.languages.body": msg({
		message: "The same facts in Arabic and English, exported with Western digits so dates read correctly.",
		context: "landing.languages.body",
	}),
	"landing.trust.title": msg({ message: "Your data stays under your control", context: "landing.trust.title" }),
	"landing.trust.body": msg({
		message: "Your CVs are private documents in your account, and you decide what happens to them.",
		context: "landing.trust.body",
	}),
	"landing.trust.review": msg({ message: "Changes only after your review", context: "landing.trust.review" }),
	"landing.trust.private": msg({ message: "Private documents", context: "landing.trust.private" }),
	"landing.trust.export": msg({ message: "Export a copy of your data from settings", context: "landing.trust.export" }),
	"landing.trust.delete": msg({
		message: "Request deletion of your account and data",
		context: "landing.trust.delete",
	}),
	"landing.faq.title": msg({ message: "Questions, answered", context: "landing.faq.title" }),
	"landing.faq.subtitle": msg({
		message: "Still unsure? Help and contact is one link away.",
		context: "landing.faq.subtitle",
	}),
	"landing.faq.guarantee.question": msg({
		message: "Do you guarantee that I will get the job?",
		context: "landing.faq.guarantee.question",
	}),
	"landing.faq.guarantee.answer": msg({
		message: "No. We help you write a clear and honest CV. The employer makes the hiring decision.",
		context: "landing.faq.guarantee.answer",
	}),
	"landing.faq.invented.question": msg({
		message: "Do you add achievements I did not provide?",
		context: "landing.faq.invented.question",
	}),
	"landing.faq.invented.answer": msg({
		message: "No. Every suggestion shows the original text. We ask about missing information instead of guessing.",
		context: "landing.faq.invented.answer",
	}),
	"landing.faq.free.question": msg({ message: "Can I start without paying?", context: "landing.faq.free.question" }),
	"landing.faq.free.answer": msg({
		message:
			"CV writing, review and qualified PDF downloads are free within the limits shown in your account. No paid offer is available here.",
		context: "landing.faq.free.answer",
	}),
	"landing.faq.import.question": msg({
		message: "Can I import my current CV?",
		context: "landing.faq.import.question",
	}),
	"landing.faq.import.answer": msg({
		message:
			"Yes, from a readable PDF. You review the imported facts before you save them. Word files are not supported.",
		context: "landing.faq.import.answer",
	}),
	"landing.faq.word.question": msg({ message: "Can I download Word files?", context: "landing.faq.word.question" }),
	"landing.faq.word.answer": msg({ message: "Word downloads are not available.", context: "landing.faq.word.answer" }),
	"landing.faq.language.question": msg({
		message: "Does switching the interface translate my CV?",
		context: "landing.faq.language.question",
	}),
	"landing.faq.language.answer": msg({
		message:
			"No. Arabic and English document versions are independent. Switching the interface does not change saved facts.",
		context: "landing.faq.language.answer",
	}),
	"landing.faq.rights.question": msg({ message: "How do I manage my data?", context: "landing.faq.rights.question" }),
	"landing.faq.rights.answer": msg({
		message:
			"Use Privacy and data in your account to correct, export or request deletion of your data. Account proof is required.",
		context: "landing.faq.rights.answer",
	}),
	"landing.cta.title": msg({ message: "Ready to put your CV in order?", context: "landing.cta.title" }),
	"landing.cta.body": msg({
		message: "Free to start, and every change waits for your approval.",
		context: "landing.cta.body",
	}),
	"landing.footer.tagline": msg({
		message: "Clear, honest CVs, written in Arabic first.",
		context: "landing.footer.tagline",
	}),
	"legal.draft.notice": msg({ message: "Privacy and terms", context: "legal.draft.notice" }),
	"common.navigation.signIn": msg({ message: "Sign in", context: "common.navigation.signIn" }),
	"legal.page.title": msg({ message: "Privacy and terms", context: "legal.page.title" }),
	"legal.tab.privacy": msg({ message: "Privacy", context: "legal.tab.privacy" }),
	"legal.tab.terms": msg({ message: "Terms", context: "legal.tab.terms" }),
	"legal.draft.revision": msg({ message: "Account data and controls", context: "legal.draft.revision" }),
	"legal.privacy.data.title": msg({ message: "Data in your account", context: "legal.privacy.data.title" }),
	"legal.privacy.data.body": msg({
		message:
			"Your account can contain profile details, CVs, saved versions, imports and support messages. Private documents require account access.",
		context: "legal.privacy.data.body",
	}),
	"legal.privacy.rights.title": msg({
		message: "Correction, export and deletion",
		context: "legal.privacy.rights.title",
	}),
	"legal.privacy.rights.body": msg({
		message:
			"Edit your saved information in your account. Privacy and data provides a private account archive and a deletion request. These controls require identity proof. Support cannot grant access from an unverified message.",
		context: "legal.privacy.rights.body",
	}),
	"legal.privacy.deletion.title": msg({
		message: "What a deletion request means",
		context: "legal.privacy.deletion.title",
	}),
	"legal.privacy.deletion.body": msg({
		message:
			"An accepted request revokes account access and blocks new work. Completion waits for active data erasure, stored files and applicable external-provider and renewal steps. A pending step is not a completed deletion.",
		context: "legal.privacy.deletion.body",
	}),
	"legal.privacy.retention.title": msg({
		message: "Policies still under review",
		context: "legal.privacy.retention.title",
	}),
	"legal.privacy.retention.body": msg({
		message:
			"Production retention periods, provider contracts and backup recovery procedures still require approval. The current controls do not prove backup destruction. This draft does not set those policies.",
		context: "legal.privacy.retention.body",
	}),
	"legal.terms.capabilities.title": msg({ message: "Current capabilities", context: "legal.terms.capabilities.title" }),
	"legal.terms.capabilities.body": msg({
		message:
			"Write and review your CV in a private account. Review proposed changes before applying them. Qualified PDF downloads follow account limits. Arabic and English versions remain separate. Word downloads and public sharing are unavailable.",
		context: "legal.terms.capabilities.body",
	}),
	"legal.terms.approval.title": msg({ message: "Account controls", context: "legal.terms.approval.title" }),
	"legal.terms.approval.body": msg({
		message:
			"This page describes the existing account controls. It does not introduce payment offers or a new acceptance step.",
		context: "legal.terms.approval.body",
	}),
	"legal.navigation.data": msg({ message: "Manage your data", context: "legal.navigation.data" }),
	"public.meta.home.description": msg({
		message:
			"Create and review your CV in a private account. Keep Arabic and English versions separate. Qualified PDF downloads are free within account limits.",
		context: "public.meta.home.description",
	}),
	"public.meta.legal.description": msg({
		message: "Existing account data controls and current capabilities.",
		context: "public.meta.legal.description",
	}),
	"public.meta.help.title": msg({ message: "Help and contact", context: "public.meta.help.title" }),
	"public.meta.help.description": msg({
		message:
			"Contact Sirawise support and find answers about PDF downloads, interface languages and account data controls.",
		context: "public.meta.help.description",
	}),
} as const;
export const getPublicCopy = (key: keyof typeof publicMessages) => i18n._(publicMessages[key]);
export function usePublicCopy() {
	const { i18n } = useLingui();
	return (key: keyof typeof publicMessages) => i18n._(publicMessages[key]);
}
