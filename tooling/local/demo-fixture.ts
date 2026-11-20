// Synthetic local data uses reserved .test addresses and unassigned phone numbers.
import { plainMasterFact } from "@reactive-resume/api/features/career/plain-text";
import { careerProfileDataSchema } from "@reactive-resume/schema/career";
import { masterFactInputSchema, masterFields } from "@reactive-resume/schema/career-master";
import { coverLetterContentSchema } from "@reactive-resume/schema/cover-letter/data";
import {
	createDemoApplications,
	demoFacts as facts,
	demoStories as stories,
	demoJobs as jobs,
	demoSource as source,
} from "./demo-career";
import { demoCredentials } from "./demo-credentials";
import { createDemoResume } from "./demo-resume";
import { demoShowcaseResumes } from "./demo-showcase";

export { demoCredentials } from "./demo-credentials";
export const demoAccountName = "Nawaf Al-Suhaili";
const resumes = [createDemoResume(true), createDemoResume(false), createDemoResume(false, true)] as const;
const arabic = resumes[0];
const masterFacts = (Object.keys(masterFields) as Array<keyof typeof masterFields>).flatMap((section) =>
	arabic.sections[section].items.flatMap((item) =>
		Object.entries(item)
			.filter(([key]) => key in masterFields[section].shape)
			.map(([field, value]) =>
				plainMasterFact(masterFactInputSchema.parse({ section, entityId: item.id, field, value, source })),
			),
	),
);
const letterBodies = [
	"<p>فريق التوظيف المحترم،</p><p>أقدم خبرتي في قيادة عمليات المنتجات وتحسين الخدمات. تمتد مسيرتي من 2006 إلى 2026 عبر ثماني جهات، بدءًا من تنسيق العمليات وصولًا إلى قيادة فرق متعددة التخصصات. نظمت مراجعات مع 8 إلى 15 فريقًا وخفضت وقت إعداد التقارير بنسبة بين 15% و22% باستخدام بيانات التشغيل.</p><p>أهتم بتحديد المسؤوليات وتوثيق القرارات وإدارة المخاطر وتدريب الزملاء. توضح قصص الخبرة المرفقة كيفية معالجة حالات الاستثناء وقياس النتائج ومراجعة حدود الأرقام. أتطلع إلى مناقشة أولويات الفريق وخطة تسليم واضحة لأول تسعين يومًا وكيفية تحويل متطلبات الخدمة إلى مؤشرات قابلة للمراجعة.</p><p>مع التحية،<br>نواف السهلي</p>",
	"<p>Dear hiring team,</p><p>I offer twenty years of experience in product operations and service improvement, from 2006 through 2026. My career spans eight organizations and progresses from operations coordination to multidisciplinary leadership. I coordinated reviews with 8 to 15 teams and reduced report preparation time by 15% to 22% using operational data.</p><p>My examples cover ownership, decision records, risk management, colleague training and exception recovery. The STAR stories explain the measurement limits and lessons from each period. I welcome a discussion about team priorities, a clear handover plan and the first ninety days. I can help translate service requirements into practical indicators and build a review process that keeps the team informed.</p><p>Kind regards,<br>Nawaf Al-Suhaili</p>",
];
const letters = Array.from({ length: 8 }, (_, i) => {
	const data = resumes[i % 2 === 0 ? 0 : 1];
	return {
		...coverLetterContentSchema.parse({
			name: ["خطاب عام", "General letter", "Tailored letter"][i % 3],
			recipient: `<p>${jobs[i]?.employer}<br>hiring${i}@sirawise.test</p>`,
			content: letterBodies[i % 2],
			style: {
				basics: data.basics,
				picture: data.picture,
				metadata: data.metadata,
				sectionId: "demo-cover-letter",
				itemId: `demo-letter-${i}`,
			},
			layout: "structured",
			recipientName: i % 2 === 0 ? "فريق التوظيف" : "Hiring team",
			recipientCompany: jobs[i]?.employer,
			letterDate: "2026-11-18",
		}),
		documentLocale: i % 2 === 0 ? ("ar-SA" as const) : ("en-US" as const),
	};
});

export function createDemoFixture(now: Date) {
	const applicationScenarios = createDemoApplications(now);
	return {
		source,
		profile: careerProfileDataSchema.parse({
			contact: {
				name: createDemoResume(true).basics.name,
				email: demoCredentials.email,
				phone: createDemoResume(true).basics.phone,
				location: createDemoResume(true).basics.location,
			},
			summary: "",
			targetRoles: ["Product operations director", "Service improvement lead"],
			locations: ["Riyadh, Saudi Arabia"],
			priorities: "Lead product operations, improve reporting quality, mentor teams and maintain clear ownership.",
			minBase: { amount: 24000, currency: "SAR", period: "month" },
			memoryMode: "off",
		}),
		masterFacts,
		facts,
		stories,
		resumes,
		showcaseResumes: demoShowcaseResumes,
		letters,
		jobs,
		applications: applicationScenarios.map((row) => row.input),
		applicationScenarios,
	};
}

export const demoFixture = createDemoFixture(new Date());
