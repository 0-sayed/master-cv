/**
 * One synthetic person, Abdullah Alqahtani, an accountant in Riyadh, told in both document languages. These are CV
 * contents (names, roles, dates, skills, document headings and sample job ads), so they stay in the document's own
 * language whatever the interface language is, and are never routed through the interface catalog.
 */
export type ExampleLanguage = "ar" | "en";
export type EvidenceStatus = "found" | "partial" | "missing";
/** CV lines a mock can point at; `CvPaper` marks each with `data-fact`. */
export type FactId = "role" | "bullet-0" | "bullet-1" | "education" | "skills";
export type SampleJobId = "accountant" | "hr" | "sales";

type Requirement = { text: string; status: EvidenceStatus; note: string; fact?: FactId };

type ExampleCv = {
	lang: "ar-SA" | "en-US";
	dir: "rtl" | "ltr";
	name: string;
	role: string;
	location: string;
	email: string;
	file: string;
	headings: { summary: string; experience: string; education: string; skills: string };
	summary: string;
	job: { title: string; organization: string; dates: string; bullets: readonly [string, string] };
	education: { degree: string; dates: string };
	skills: readonly string[];
	before: string;
	after: string;
	jobs: Readonly<Record<SampleJobId, { title: string; requirements: readonly Requirement[] }>>;
};

const email = "abdullah@example.com";
export const sampleJobIds = ["accountant", "hr", "sales"] as const satisfies readonly SampleJobId[];

export const landingExample: Readonly<Record<ExampleLanguage, ExampleCv>> = {
	ar: {
		lang: "ar-SA",
		dir: "rtl",
		name: "عبدالله القحطاني",
		role: "محاسب",
		location: "الرياض",
		email,
		file: "abdullah-cv.pdf",
		headings: { summary: "نبذة", experience: "الخبرة العملية", education: "التعليم", skills: "المهارات" },
		summary: "محاسب يعدّ تقارير مالية واضحة ودقيقة.",
		job: {
			title: "محاسب",
			organization: "شركة تجارية (مثال)",
			dates: "2021 — 2024",
			bullets: ["إعداد التقارير المالية الشهرية.", "مطابقة الحسابات البنكية مع فريق المالية."],
		},
		education: { degree: "بكالوريوس المحاسبة", dates: "2020" },
		skills: ["Excel", "التقارير المالية", "مطابقة الحسابات", "العمل الجماعي"],
		before: "أسوي التقارير المالية كل شهر.",
		after: "إعداد التقارير المالية الشهرية.",
		jobs: {
			accountant: {
				title: "محاسب أول",
				requirements: [
					{ text: "إعداد التقارير المالية", status: "found", note: "مذكورة في خبرتك.", fact: "bullet-0" },
					{ text: "مطابقة الحسابات", status: "found", note: "مذكورة في خبرتك.", fact: "bullet-1" },
					{ text: "شهادة مهنية في المحاسبة", status: "missing", note: "لم تذكر هذا في معلوماتك." },
				],
			},
			hr: {
				title: "أخصائي موارد بشرية",
				requirements: [
					{ text: "إتقان Excel", status: "found", note: "مذكور في مهاراتك.", fact: "skills" },
					{ text: "التعاون مع الإدارات", status: "partial", note: "وضّح تعاونك مع فريق المالية.", fact: "bullet-1" },
					{ text: "أنظمة الرواتب", status: "missing", note: "لم تذكر هذا في معلوماتك." },
				],
			},
			sales: {
				title: "مشرف مبيعات",
				requirements: [
					{
						text: "إعداد تقارير دورية",
						status: "partial",
						note: "اذكر إن كانت تقاريرك تشمل المبيعات.",
						fact: "bullet-0",
					},
					{ text: "العمل ضمن فريق", status: "found", note: "مذكور في مهاراتك.", fact: "skills" },
					{ text: "قيادة فريق مبيعات", status: "missing", note: "لم تذكر هذا في معلوماتك." },
				],
			},
		},
	},
	en: {
		lang: "en-US",
		dir: "ltr",
		name: "Abdullah Alqahtani",
		role: "Accountant",
		location: "Riyadh",
		email,
		file: "abdullah-cv.pdf",
		headings: { summary: "Summary", experience: "Experience", education: "Education", skills: "Skills" },
		summary: "Accountant who prepares clear, accurate financial reports.",
		job: {
			title: "Accountant",
			organization: "A trading company (example)",
			dates: "2021 — 2024",
			bullets: ["Prepare monthly financial reports.", "Reconcile bank accounts with the finance team."],
		},
		education: { degree: "Bachelor's degree in Accounting", dates: "2020" },
		skills: ["Excel", "Financial reporting", "Account reconciliation", "Teamwork"],
		before: "I do the financial reports every month.",
		after: "Prepare monthly financial reports.",
		jobs: {
			accountant: {
				title: "Senior Accountant",
				requirements: [
					{ text: "Financial reporting", status: "found", note: "In your experience.", fact: "bullet-0" },
					{ text: "Account reconciliation", status: "found", note: "In your experience.", fact: "bullet-1" },
					{ text: "Professional accounting certificate", status: "missing", note: "Not mentioned in your facts." },
				],
			},
			hr: {
				title: "HR Specialist",
				requirements: [
					{ text: "Strong Excel skills", status: "found", note: "In your skills.", fact: "skills" },
					{
						text: "Working across departments",
						status: "partial",
						note: "Describe your work with the finance team.",
						fact: "bullet-1",
					},
					{ text: "Payroll systems", status: "missing", note: "Not mentioned in your facts." },
				],
			},
			sales: {
				title: "Sales Supervisor",
				requirements: [
					{
						text: "Regular reporting",
						status: "partial",
						note: "Say whether your reports cover sales.",
						fact: "bullet-0",
					},
					{ text: "Teamwork", status: "found", note: "In your skills.", fact: "skills" },
					{ text: "Leading a sales team", status: "missing", note: "Not mentioned in your facts." },
				],
			},
		},
	},
};

/** Floating background fragments: synthetic CV facts from common Saudi jobs, positioned as percentages of the hero. */
export const heroFragments: readonly {
	text: string;
	lang: "ar-SA" | "en-US";
	kind: "title" | "line" | "chip" | "meta";
	at: { top: string; start: string; tilt: string; drift: string; duration: string; delay: string };
	desktopOnly?: boolean;
}[] = [
	{
		text: "أخصائي موارد بشرية",
		lang: "ar-SA",
		kind: "title",
		at: { top: "5%", start: "3%", tilt: "-3deg", drift: "-3.5", duration: "19s", delay: "-4s" },
		desktopOnly: true,
	},
	{
		text: "Excel",
		lang: "en-US",
		kind: "chip",
		at: { top: "7%", start: "47%", tilt: "6deg", drift: "-2.5", duration: "15s", delay: "-9s" },
		desktopOnly: true,
	},
	{
		text: "Customer Service",
		lang: "en-US",
		kind: "line",
		at: { top: "3%", start: "66%", tilt: "-2deg", drift: "-3", duration: "21s", delay: "-2s" },
		desktopOnly: true,
	},
	{
		text: "بكالوريوس المحاسبة",
		lang: "ar-SA",
		kind: "line",
		at: { top: "2%", start: "26%", tilt: "2deg", drift: "-2.5", duration: "20s", delay: "-13s" },
		desktopOnly: true,
	},
	{
		text: "2021 — 2024",
		lang: "en-US",
		kind: "meta",
		at: { top: "45%", start: "93%", tilt: "0deg", drift: "-2", duration: "17s", delay: "-6s" },
		desktopOnly: true,
	},
	{
		text: "Nursing",
		lang: "en-US",
		kind: "chip",
		at: { top: "64%", start: "90%", tilt: "-7deg", drift: "-3.5", duration: "18s", delay: "-3s" },
		desktopOnly: true,
	},
	{
		text: "مهندس مدني",
		lang: "ar-SA",
		kind: "title",
		at: { top: "50%", start: "1%", tilt: "4deg", drift: "-2.5", duration: "23s", delay: "-15s" },
		desktopOnly: true,
	},
	{
		text: "مشرف مبيعات",
		lang: "ar-SA",
		kind: "chip",
		at: { top: "90%", start: "5%", tilt: "-5deg", drift: "-3", duration: "16s", delay: "-11s" },
		desktopOnly: true,
	},
	{
		text: "Teacher",
		lang: "en-US",
		kind: "title",
		at: { top: "91%", start: "22%", tilt: "2deg", drift: "-4", duration: "22s", delay: "-7s" },
		desktopOnly: true,
	},
	{
		text: "مساعد إداري",
		lang: "ar-SA",
		kind: "meta",
		at: { top: "95%", start: "80%", tilt: "0deg", drift: "-2", duration: "19s", delay: "-10s" },
		desktopOnly: true,
	},
];
