import type { ApplicationStatus, InterviewKind } from "@reactive-resume/schema/applications/data";
import { applicationDto } from "@reactive-resume/api/dto/application";
import { careerFactInputSchema, careerStoryInputSchema } from "@reactive-resume/schema/career";
import { saveJobTargetInputSchema } from "@reactive-resume/schema/job-evidence";
import { formatUiTimestamp } from "@reactive-resume/utils/ui-format";
import { demoRequired } from "./demo-resume";

export const demoSource = {
	kind: "manual" as const,
	id: "sirawise-local-demo-v3",
	quote: "Twenty years of operations leadership, service improvement and team development.",
};

const careerPeriods = [
	"2006–2008",
	"2008–2011",
	"2011–2014",
	"2014–2017",
	"2017–2020",
	"2020–2022",
	"2022–2024",
	"2024–2026",
];
export const demoFacts = careerPeriods.flatMap((period, i) =>
	[
		`During ${period}, the professional coordinated ${8 + i} teams and maintained a documented operational review process.`,
		`During ${period}, the professional reduced reporting preparation time by ${15 + i}% using operational data.`,
	].map((text, j) =>
		careerFactInputSchema.parse({
			text,
			category: "accomplishment",
			source: { ...demoSource, id: `${demoSource.id}-fact-${i}-${j}`, quote: text },
		}),
	),
);

export const demoStories = careerPeriods.map((period, i) =>
	careerStoryInputSchema.parse({
		title: `operational improvement ${period}`,
		situation: `In ${period}, the team needed a repeatable process for reviewing reports, risks and handovers.`,
		task: `Coordinate ${8 + i} teams, document ownership and define measurable acceptance criteria.`,
		action:
			"Mapped the workflow, tested exception cases, recorded decisions and trained colleagues using sample records.",
		result: demoRequired(demoFacts[i * 2 + 1]).text,
		reflection:
			"Compare measurement limits before reusing a result. Keep evidence and ownership clear during every handover.",
		tags: ["leadership", "operations", period],
	}),
);

const companies = [
	"Wadi Product Studio",
	"مختبر واحة القياس",
	"Dune Service Systems",
	"شركة أفق الرحلة",
	"Cloud Palm Operations",
	"مكتب جسر المعرفة",
	"Eastern Harbor Analytics",
	"شركة مسار الجودة",
	"International Desert Observatory for Service Operations, Cross-Regional Reporting and Continuous Process Improvement",
	"شركة المختبر الوطني لتطوير منظومات الخدمات وتحسين جودة العمليات وتنسيق التقارير بين المناطق والفرق المتعددة",
	"Silver Wadi Lab",
	"مؤسسة رواد المسار",
	"Blue Oasis Studio",
	"مختبر رمال التحليل",
	"Cedar Dunes Services",
	"شركة مراسي التطوير",
	"Sunlit Harbor",
	"مكتب دروب الغد",
	"Date Palm Research",
	"شركة السهل الواسع",
];
const statuses = ["saved", "applied", "screening", "interview", "offer", "closed"] as const;
const closureReasons = ["accepted", "not-selected", "withdrew", "accepted-other", "no-response"] as const;

const applicationTemplates = companies.map((company, i) => {
	const ar = i % 2 === 1;
	const status = i >= 15 ? "closed" : demoRequired(statuses[i % 5]);
	const role =
		i === 8
			? "Senior Director of Cross-Regional Product Operations, Service Measurement, Governance and Knowledge Transfer for Distributed Teams"
			: i === 9
				? "مدير أول لتنسيق عمليات المنتجات وقياس جودة الخدمات وإدارة التغيير ونقل المعرفة بين الفرق الموزعة في المناطق"
				: ar
					? demoRequired(
							["مدير عمليات المنتجات", "قائد تحسين الخدمات", "مدير برامج التحليل", "استشاري العمليات"][i % 4],
						)
					: demoRequired(
							[
								"Product operations director",
								"Service improvement lead",
								"Analytics program manager",
								"Operations consultant",
							][i % 4],
						);
	const jobDescription = ar
		? `تبحث ${company} عن ${role} لقيادة تحسين العمليات وقياس جودة الخدمات. تشمل المسؤوليات إعداد تقارير أسبوعية وتحديد مؤشرات الأداء وتنسيق التسليم والتدريب ومراجعة حالات الاستثناء. تتطلب الوظيفة عشر سنوات من الخبرة على الأقل وإجادة التواصل وتحليل المتطلبات وإدارة التغيير. يقع مقر الفريق في الرياض مع تعاون بين فرق جدة والدمام ومرونة في مواعيد الاجتماعات. قدم أمثلة موثقة على قيادة الفرق وتحسين زمن إعداد التقارير وضبط جودة البيانات وخطة عملية لأول تسعين يومًا.`
		: `${company} seeks a ${role} to lead operational improvement and service measurement. Responsibilities include weekly reporting, performance indicators, handover coordination, training and exception review. The role requires at least ten years of experience, clear communication, requirements analysis and change management. The team is based in Riyadh and collaborates with colleagues in Jeddah and Dammam. Prepare evidence of team leadership, faster reporting and data quality improvement, plus a practical plan for the first ninety days.`;
	return applicationDto.create.input.parse({
		company,
		role,
		status,
		closedReason: i >= 15 ? closureReasons[i - 15] : null,
		stageEnteredAt: `2026-${String(3 + (i % 9)).padStart(2, "0")}-${String(1 + (i % 20)).padStart(2, "0")}`,
		location: ar
			? ["الرياض", "جدة", "الدمام", "عن بعد"][i % 4]
			: ["Riyadh", "Jeddah", "Dammam", "Remote · Saudi Arabia"][i % 4],
		salary: `${18000 + i * 1000}–${24000 + i * 1000} SAR / ${ar ? "شهر" : "month"}`,
		source: ar ? "وصف ملصق يدويًا ·" : "Company careers page",
		sourceUrl: `https://jobs.sirawise.test/vacancies/${i + 1}`,
		jobDescription,
		notes: ar
			? "راجع نطاق الدور ومسؤوليات الفريق وأمثلة تحسين التقارير قبل المقابلة."
			: "Review the role scope, team responsibilities and reporting improvements before the interview.",
		followUpAt: new Date(`2026-11-${String(19 + (i % 9)).padStart(2, "0")}T09:00:00+03:00`),
		followUpNote: ar
			? "راجع جدول المقابلة وسجل أسئلة التحضير."
			: "Review the interview schedule and preparation questions.",
		contacts: [
			{
				id: `demo-contact-${i}`,
				name: ar ? "ريم الواحة " : "Reem Al-Waha ",
				email: `recruiter${i}@sirawise.test`,
				phone: "+966 50 000 0000",
				type: ar ? "توظيف" : "recruiter",
			},
		],
		tags: ["leadership", ar ? "Arabic posting" : "English posting", i === 19 ? "no resume" : "operations"],
	});
});

export type DemoApplicationFixture = {
	input: (typeof applicationTemplates)[number];
	history: { stage: ApplicationStatus; at: Date }[];
	resumeGroup: "tailored" | "base" | "unlinked";
	interviews: {
		kind: InterviewKind;
		at: Date;
		timezone: string;
		durationMinutes: number;
		location: string;
		notes: string;
		participants: [];
		audience: "practitioner" | "recruiter";
	}[];
};

const definitions: [ApplicationStatus, (typeof applicationTemplates)[number]["closedReason"], number, number | null][] =
	[
		["saved", null, 0, null],
		["saved", null, 0, null],
		...[0, 1, 2, 3, 4, 5].map((): [ApplicationStatus, null, number, null] => ["applied", null, 1, null]),
		["screening", null, 2, 3],
		["screening", null, 2, 4],
		["screening", null, 2, 4],
		["interview", null, 3, 5],
		["interview", null, 3, 6],
		["offer", null, 4, 6],
		["closed", "accepted", 4, 7],
		["closed", "not-selected", 2, 8],
		["closed", "not-selected", 3, 10],
		["closed", "not-selected", 1, 2],
		["closed", "withdrew", 3, 12],
		["closed", "no-response", 1, null],
	];
const sourceLabels = [
	"LinkedIn",
	"Company website · careers page",
	"Bayt",
	"إحالة من زميل سابق في فريق العمل",
	"Recruiter · direct outreach",
	"معرض التوظيف بجامعة الملك سعود",
	null,
];
const sourceIds = [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 5, 6];

/** Scenario definitions do not grant permission to persist additional job copies. */
export function createDemoApplications(now: Date): DemoApplicationFixture[] {
	const day = 86400000;
	const local = new Date(now.getTime() + 10800000);
	const currentWeek =
		Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - local.getUTCDay()) - 10800000;
	const firstWeek = currentWeek - 49 * day;
	const slots = [1, 2, 1, 3, 2, 4, 3, 2].flatMap((count, week) =>
		Array.from({ length: count }, () => new Date(Math.min(firstWeek + week * 7 * day + 10 * 3600000, now.getTime()))),
	);
	// Replies occupy older weeks so every historical transition remains before the injected clock.
	const sendOrder = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 2, 3, 4, 5, 6, 7, 19];
	const sentAt = new Map(sendOrder.map((index, slot) => [index, demoRequired(slots[slot])]));
	const tomorrow = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1) - 10800000;
	const saturday = Math.max(tomorrow, currentWeek + 6 * day);
	const nextWeek = currentWeek + 7 * day;
	const nextMonth = Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) - 10800000;
	// Four tomorrow, including a morning/noon/afternoon cluster. Saturday falls forward if the week already ended.
	const appointments: [number, number, number, InterviewKind, number][] = [
		[8, tomorrow, 9, "screening", 30],
		[11, tomorrow, 12, "technical", 60],
		[12, tomorrow, 16, "behavioral", 45],
		[9, tomorrow, 18, "screening", 30],
		[10, saturday, 10, "screening", 30],
		[11, saturday, 14, "onsite", 90],
		[12, nextWeek + day, 9, "other", 45],
		[8, nextWeek + 3 * day, 14, "screening", 30],
		[11, nextMonth + 4 * day, 11, "technical", 60],
		[12, nextMonth + 11 * day, 15, "onsite", 90],
	];
	return definitions.map(([status, closedReason, furthest, replyDays], i): DemoApplicationFixture => {
		const sent = sentAt.get(i) ?? now;
		const history: DemoApplicationFixture["history"] = [{ stage: "saved", at: new Date(sent.getTime() - day) }];
		if (status !== "saved") history.push({ stage: "applied", at: sent });
		for (let stage = 2; stage <= furthest; stage++)
			history.push({
				stage: demoRequired(statuses[stage]),
				at: new Date(sent.getTime() + ((replyDays ?? 0) + stage - 2) * day),
			});
		if (status === "closed")
			history.push({
				stage: "closed",
				at: new Date(
					Math.min(now.getTime(), sent.getTime() + (replyDays === null ? 10 : replyDays + furthest - 1) * day),
				),
			});
		const finalAt = demoRequired(history.at(-1)).at;
		const input = applicationDto.create.input.parse({
			...demoRequired(applicationTemplates[i]),
			status,
			closedReason,
			source: sourceLabels[demoRequired(sourceIds[i])],
			stageEnteredAt: formatUiTimestamp(finalAt, "en-US", {
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
			}).replace(/(\d+)\/(\d+)\/(\d+)/, "$3-$1-$2"),
			followUpAt: new Date(now.getTime() + ((i % 7) + 1) * day),
		});
		const resumeGroup =
			i < 2
				? "base"
				: i === 5 || i === 19
					? "unlinked"
					: (i >= 8 && i <= 15) || (i >= 2 && i <= 4)
						? "tailored"
						: "base";
		return {
			input,
			history,
			resumeGroup,
			interviews: [
				...(furthest >= 3
					? [
							{
								kind: "technical",
								at: demoRequired(history.find((event) => event.stage === "interview")).at,
								timezone: "Asia/Riyadh",
								durationMinutes: 60,
								location: "Riyadh",
								notes: "Discuss operational examples and measurement limits.",
								participants: [],
								audience: "practitioner",
							} satisfies DemoApplicationFixture["interviews"][number],
						]
					: []),
				...appointments
					.filter(([index]) => index === i)
					.map(([, start, hour, kind, durationMinutes]): DemoApplicationFixture["interviews"][number] => ({
						kind,
						at: new Date(start + hour * 3600000),
						timezone: "Asia/Riyadh",
						durationMinutes,
						location: kind === "onsite" ? (i % 2 ? "مكتب الرياض" : "Riyadh office") : "Online meeting",
						notes:
							i % 2
								? "راجع نطاق الدور وأمثلة تحسين العمليات قبل الموعد."
								: "Prepare role questions and operational examples.",
						participants: [] as [],
						audience: kind === "screening" ? ("recruiter" as const) : ("practitioner" as const),
					})),
			],
		};
	});
}

export const demoApplications = createDemoApplications(new Date()).map((row) => row.input);
export const demoJobs = demoApplications.slice(0, 8).map((application) =>
	saveJobTargetInputSchema.parse({
		role: application.role,
		employer: application.company,
		text: application.jobDescription,
	}),
);

export function demoApplicationNotes(index: number, now = new Date()) {
	const ar = index % 2 === 1;
	const date = demoRequired(demoRequired(createDemoApplications(now)[index]).input.stageEnteredAt);
	const texts = ar
		? [
				"حفظت الإعلان وراجعت نطاق الدور والمهارات المطلوبة والراتب المعروض.",
				"متابعة: راجع منسق التوظيف جدول الاجتماعات. جهز المواعيد المناسبة وأسئلة الاجتماع القادم.",
				"حضرت مثالًا عن تحسين التقارير وتحديد المسؤوليات وإدارة حالات الاستثناء.",
				"راجعت أسئلة المقابلة وخطة التسليم والأرقام الواردة في السيرة.",
			]
		: [
				"Saved the posting and reviewed the role scope, required skills and salary.",
				"follow-up: the recruitment coordinator reviewed meeting availability. Prepare availability and questions for the next discussion.",
				"Prepared an example about reporting improvements, clear ownership and exception handling.",
				"Reviewed interview questions, the handover plan and limits of the resume metrics.",
			];
	return Array.from({ length: index === 3 ? 12 : 4 }, (_, i) => ({
		text: demoRequired(texts[i % texts.length]),
		date,
	}));
}
