import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { parseResumeData } from "@reactive-resume/schema/resume/data";
import { templateLayouts, type Template } from "@reactive-resume/schema/templates";
import { createDemoResume } from "./demo-resume";
import { demoShowcaseResumes } from "./demo-showcase";

export function realPdfFixture(template: Template, locale: "ar-SA" | "en-US", weak: boolean): ResumeData {
	const arabic = locale === "ar-SA";
	const strong = structuredClone(demoShowcaseResumes[1].data);
	const english = createDemoResume(false);
	const data = arabic ? strong : english;
	if (!arabic) {
		data.metadata = structuredClone(strong.metadata);
		data.metadata.page.locale = locale;
		for (const kind of ["body", "heading"] as const) data.metadata.typography[kind].fontFamily = "Carlito";
		data.basics.name = data.basics.name.trim();
		data.basics.customFields = [];
		data.basics.website = structuredClone(strong.basics.website);
		data.picture = structuredClone(strong.picture);
		data.customSections = [];
		for (const [key, section] of Object.entries(data.sections)) {
			if (!["experience", "education", "skills", "languages"].includes(key)) {
				section.hidden = true;
				section.items = [];
			}
		}
		data.summary.content =
			"<p>Product operations director with 20 years of experience in service improvement and data analysis. Reduced reporting time by 22% and coordinated reviews with 15 teams. Leads clear ownership, risk management and measurable delivery.</p>";
		data.sections.experience.items = data.sections.experience.items
			.map((item, index) => ({
				...item,
				roles: [],
				website: { url: "", label: "", inlineLink: false },
				description: `<ul><li>${["Led", "Built", "Designed", "Delivered", "Coordinated", "Improved", "Automated", "Reduced"][index]} reporting reviews with ${8 + index} teams and documented delivery decisions.</li><li>${["Automated", "Improved", "Created", "Streamlined", "Built", "Designed", "Delivered", "Optimized"][index]} quality reports and reduced preparation time by ${15 + index}%.</li></ul>`,
			}))
			.reverse();
		data.sections.education.items = data.sections.education.items
			.map((item) => ({
				...item,
				description: "",
				grade: "",
				website: { url: "", label: "", inlineLink: false },
			}))
			.reverse();
		data.sections.skills.items = data.sections.skills.items
			.slice(0, 3)
			.map((item) => ({ ...item, level: 0, proficiency: "", keywords: [] }));
		data.sections.skills.columns = 1;
		data.sections.languages.columns = 1;
	}
	const current = data.sections.experience.items[0];
	if (!current) throw new Error("The demo needs a current role.");
	current.dates = { start: "2024-01", end: null, present: true };
	current.period = "2024 - present";
	data.metadata.template = template;
	const columns = templateLayouts[template].columns === 2;
	data.metadata.layout.pages = [
		{
			fullWidth: !columns,
			main: columns
				? ["summary", "experience", "education"]
				: ["summary", "experience", "skills", "education", "languages"],
			sidebar: columns ? ["skills", "languages"] : [],
		},
	];
	data.metadata.layout.sidebarWidth = 30;
	data.basics.website.label = arabic ? "ملف مهني" : "Portfolio";
	if (weak) {
		data.basics.phone = "";
		data.sections.skills.title = arabic ? "ما أجيده" : "My toolbox";
		data.sections.skills.showHeading = true;
		data.metadata.typography.body.fontSize = 8;
		data.sections.experience.columns = columns ? 1 : 2;
		// Education overlaps this interval. Only employment can close an employment gap.
		data.sections.experience.items = data.sections.experience.items.filter((item) => item.dates?.start !== "2017-01");
		data.sections.experience.items.forEach((item, index) => {
			const sentence = arabic
				? "كنت مسؤولًا عن متابعة العمل اليومي وتجميع احتياجات الإدارات ومراجعة الإجراءات المستخدمة. أنا أساعد الفريق في تجهيز تقارير الجودة وأرسل الملاحظات إلى المدير وأتابع الطلبات المفتوحة. شاركت في تدريب الزملاء الجدد على الإجراءات وكنت أتعاون معهم لحل المشكلات التي تظهر أثناء التسليم والحفاظ على سير العمل. أرى أن خبرتي تساعدني في التعامل مع ضغط العمل وتغير الأولويات وأهتم بتطوير نفسي وتحمل المسؤولية."
				: "I was responsible for following daily work and collecting requirements from departments. I helped the team prepare quality reports and sent notes to the manager while following open requests. I participated in training new colleagues and worked with them to resolve delivery problems. My experience helps me work under pressure and respond to changing priorities while improving my own skills.";
			item.description = `<ul><li>${sentence}</li></ul>`;
			if (index === 0) return;
			if (!item.dates?.start || !item.dates.end) throw new Error("The demo needs dated employment.");
			const start = item.dates.start.slice(0, 4);
			const end = item.dates.end.slice(0, 4);
			const period =
				index % 2
					? `${start} - ${end}`
					: `${arabic ? "يناير" : "January"} ${start} - ${arabic ? "يناير" : "January"} ${end}`;
			item.period = period;
			item.dates = { start: null, end: null, present: false, raw: period };
		});
	}
	return parseResumeData(data);
}
