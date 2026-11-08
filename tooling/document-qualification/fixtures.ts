import type { QualificationCase } from "./types";
import assert from "node:assert/strict";
import { parseResumeData } from "@reactive-resume/schema/resume/data";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { sourceGoldText } from "./source-gold";

// Synthetic authored facts. These are drafts for native Arabic review, not a labelled acceptance set.
const scenarios = [
	{
		name: "أحمد العتيبي",
		company: "شركة الأفق",
		role: "مهندس برمجيات",
		school: "جامعة الملك سعود",
		skill: "TypeScript",
		summary: "طورت أنظمة آمنة لتحليل البيانات.",
	},
	{
		name: "لَيْلَى الحَرْبِي",
		company: "مؤسسة النور",
		role: "مديرة مشاريع",
		school: "جامعة الأميرة نورة",
		skill: "إدارة المشاريع",
		summary: "أدرت فريقاً لتطوير الخدمات الرقمية.",
	},
	{
		name: "مُحَمَّد عبد الله",
		company: "تقنية الرياض",
		role: "محلل بيانات",
		school: "جامعة جدة",
		skill: "Python",
		summary: "حللت البيانات وقدمت تقارير دقيقة.",
	},
	{
		name: "سارة آل سالم",
		company: "مركز الابتكار",
		role: "مصممة منتجات",
		school: "جامعة الدمام",
		skill: "Figma",
		summary: "صممت واجهات تدعم العربية والإنجليزية.",
	},
	{
		name: "عبد الرحمن الشمري",
		company: "حلول المستقبل",
		role: "مهندس نظم",
		school: "جامعة تبوك",
		skill: "Linux",
		summary: "حسنت موثوقية الأنظمة ومراقبة الخدمات.",
	},
];
const templates = ["onyx", "bronzor", "gengar", "azurill"] as const;
export function qualificationFixtures(): QualificationCase[] {
	const result: QualificationCase[] = [];
	for (const language of ["ar", "en", "mixed"] as const) {
		const count = language === "ar" ? 20 : 15;
		for (let index = 0; index < count; index++) {
			const arabic = scenarios[index % scenarios.length];
			assert(arabic);
			const englishName = ["Ada Lovelace", "Grace Hopper", "Katherine Johnson", "Mary Jackson", "Dorothy Vaughan"][
				index % 5
			];
			assert(englishName);
			const english = {
				name: englishName,
				company: "Horizon Systems",
				role: "Software Engineer",
				school: "Example University",
				skill: "TypeScript",
				summary: "Built reliable systems for document processing.",
			};
			const facts =
				language === "en"
					? english
					: language === "mixed"
						? { ...arabic, role: "Senior Software Engineer", skill: "Node.js / SQL" }
						: arabic;
			const id = `${language === "mixed" ? "MX" : language.toUpperCase()}${String(index + 1).padStart(2, "0")}`;
			const data = structuredClone(defaultResumeData);
			data.picture.hidden = true;
			data.basics = {
				...data.basics,
				name: facts.name,
				headline: facts.role,
				email: "synthetic@example.test",
				phone: index % 3 === 1 ? "+٩٦٦ ٥٠ ١٢٣ ٤٥٦٧" : index % 3 === 2 ? "+۹۶۶ ۵۰ ۱۲۳ ۴۵۶۷" : "+966 50 123 4567",
				location: language === "en" ? "Riyadh" : "الرياض",
			};
			data.summary.content = `<p>${facts.summary}</p>`;
			data.sections.experience.items = [
				{
					id: `${id}-job`,
					hidden: false,
					company: facts.company,
					position: facts.role,
					location: data.basics.location,
					website: { url: "", label: "", inlineLink: false },
					description: language === "en" ? "<p>Delivered secure applications.</p>" : "<p>طورت تطبيقات آمنة.</p>",
					period: "",
					dates: { start: "2020", end: "2022", present: false },
					roles: [],
				},
			];
			data.sections.education.items = [
				{
					id: `${id}-school`,
					hidden: false,
					school: facts.school,
					degree: language === "en" ? "Computer Science" : "علوم الحاسب",
					area: "",
					grade: "",
					location: "",
					website: { url: "", label: "", inlineLink: false },
					description: "",
					period: "",
					dates: { start: "2016", end: "2020", present: false },
				},
			];
			data.sections.skills.items = [
				{
					id: `${id}-skill`,
					hidden: false,
					name: facts.skill,
					icon: "",
					iconColor: "",
					proficiency: "",
					level: 0,
					keywords: [],
				},
			];
			data.sections.projects.items = [
				{
					id: `${id}-hidden`,
					hidden: true,
					name: "HIDDEN-FACT",
					period: "",
					website: { url: "", label: "", inlineLink: false },
					description: "",
					dates: { start: null, end: null, present: false },
				},
			];
			data.metadata.page.locale = language === "en" ? "en-US" : "ar-SA";
			data.metadata.page.hideIcons = true;
			const template = templates[index % templates.length];
			assert(template);
			data.metadata.template = template;
			data.metadata.typography.body.fontFamily = language === "en" ? "Noto Sans" : "Noto Sans Arabic";
			data.metadata.typography.heading.fontFamily = data.metadata.typography.body.fontFamily;
			data.metadata.layout.pages = [
				index % 2 === 0
					? { fullWidth: true, main: ["summary", "experience", "education", "skills", "projects"], sidebar: [] }
					: { fullWidth: false, main: ["summary", "experience", "education", "projects"], sidebar: ["skills"] },
			];
			const fields = [
				{ id: "name", value: facts.name },
				{ id: "email", value: data.basics.email },
				{ id: "location", value: data.basics.location },
				{ id: "phone", value: data.basics.phone },
				{ id: "company", value: facts.company },
				{ id: "role", value: facts.role, occurrence: 1 },
				{ id: "job-start", value: "2020" },
				{ id: "job-end", value: "2022" },
				{ id: "school", value: facts.school },
				{ id: "education-start", value: "2016" },
				{ id: "education-degree", value: language === "en" ? "Computer Science" : "علوم الحاسب" },
				{ id: "education-end", value: "2020", occurrence: 1 },
				{ id: "skill", value: facts.skill },
			];
			const item: QualificationCase = {
				id,
				language,
				split: index < 4 ? "smoke" : index >= count - (language === "ar" ? 4 : 3) ? "held-out" : "development",
				paths: ["export"],
				data: parseResumeData(data),
				gold: {
					review: { status: "draft" },
					text: [
						facts.name,
						facts.role,
						data.basics.email,
						data.basics.phone,
						data.basics.location,
						facts.summary,
						facts.company,
						facts.role,
						data.basics.location,
						"2020",
						"2022",
						language === "en" ? "Delivered secure applications." : "طورت تطبيقات آمنة.",
						facts.school,
						language === "en" ? "Computer Science" : "علوم الحاسب",
						"2016",
						"2020",
						facts.skill,
					].join(" "),
					fields,
					associations: [
						{ id: "job", fields: ["company", "role", "job-start", "job-end"] },
						{ id: "education", fields: ["school", "education-start", "education-degree", "education-end"] },
					],
					order: [
						["company", "school"],
						["job-start", "job-end"],
						["education-start", "education-end"],
					],
					forbidden: ["HIDDEN-FACT"],
				},
			};
			addSmokeRisks(item);
			for (const field of item.gold.fields) {
				if (field.id === "skill") field.match = "mixed-free-text";
				if (field.id === "hijri-raw" || field.id === "ambiguous-raw") field.match = "date";
			}
			item.data = parseResumeData(item.data);
			item.gold.text = sourceGoldText(item.data);
			result.push(item);
		}
	}
	return result;
}

function addSmokeRisks(item: QualificationCase) {
	const { data, gold, id } = item;
	const job = data.sections.experience.items[0];
	assert(job);
	if (id === "AR01" || id === "MX04") {
		const company = id === "AR01" ? "شركة المسار" : "Atlas Analytics";
		const role = id === "AR01" ? "محلل نظم" : "محللة نظم";
		data.sections.experience.items.push({
			...structuredClone(job),
			id: `${id}-job-2`,
			company,
			position: role,
			dates: { start: "2011", end: "2013", present: false },
			description: "",
			roles: [],
		});
		gold.fields.push(
			{ id: "company-2", value: company },
			{ id: "role-2", value: role },
			{ id: "job-2-start", value: "2011" },
			{ id: "job-2-end", value: "2013" },
		);
		gold.associations.push({ id: "job-2", fields: ["company-2", "role-2", "job-2-start", "job-2-end"] });
		gold.order.push(["company", "company-2"], ["company-2", "school"], ["job-2-start", "job-2-end"]);
		gold.text += ` ${company} ${role} ${data.basics.location} 2011 2013`;
	}
	if (id === "AR02") data.sections.experience.title = "الـخِبْرَاتُ المهنية والمشاريع التقنية وتطوير الخدمات الرقمية";
	if (id === "AR03") {
		for (const [suffix, name, raw] of [
			["hijri", "مشروع التقويم", "١٤٤٥ هـ - ١٤٤٦ هـ"],
			["ambiguous", "مشروع التاريخ", "٠١/٠٢/٢٠٢٤"],
		] as const) {
			data.sections.projects.items.push({
				id: `${id}-${suffix}`,
				hidden: false,
				name,
				period: raw,
				dates: { start: null, end: null, present: false, raw },
				website: { url: "", label: "", inlineLink: false },
				description: "",
			});
			gold.fields.push({ id: `${suffix}-raw`, value: raw }, { id: `${suffix}-title`, value: name });
			gold.associations.push({ id: `${suffix}-entry`, fields: [`${suffix}-title`, `${suffix}-raw`] });
			gold.text += ` ${name} ${raw}`;
		}
	}
	if (id === "AR04" || id === "EN02") {
		const paragraph =
			id === "AR04"
				? "أنجزت أعمال تطوير واختبار ومراجعة وتحسين للأنظمة والخدمات مع الفريق."
				: "Delivered development, verification, review and reliability improvements with the team.";
		job.description = Array.from({ length: 45 }, () => `<p>${paragraph}</p>`).join("");
		gold.text += ` ${Array(45).fill(paragraph).join(" ")}`;
	}
	if (id === "MX01") {
		data.basics.website = { url: "https://example.test/portfolio", label: "example.test/portfolio" };
		gold.fields.push({ id: "url", value: "example.test/portfolio" });
		gold.text += " example.test/portfolio";
	}
	if (id === "EN03") {
		job.description = "<p>Reduced latency by 12.5% across 3 services.</p>";
		gold.fields.push({ id: "precision", value: "12.5%" }, { id: "service-count", value: "3 services" });
		gold.text += " Reduced latency by 12.5% across 3 services.";
	}
}
