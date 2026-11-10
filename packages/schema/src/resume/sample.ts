import type { ResumeData } from "./data";
import { defaultResumeData } from "./default";

/** Fictional Saudi examples; portrait provenance (stock/synthetic) lives in templates/photos-licenses.md. */
export const createSampleResumeData = (
	name?: string,
	locale = "ar-SA",
	persona: "female" | "male" = "female",
): ResumeData => {
	const ar = locale.startsWith("ar");
	const text = (arabic: string, english: string) => (ar ? arabic : english);
	const male = persona === "male";
	const slug = male ? "abdullah.alqahtani" : "sara.alotaibi";
	const location = male
		? text("جدة، المملكة العربية السعودية", "Jeddah, Saudi Arabia")
		: text("الرياض، المملكة العربية السعودية", "Riyadh, Saudi Arabia");
	const website = { url: "", label: "", inlineLink: false };
	const item = (id: string) => ({ id, hidden: false });
	const data: ResumeData = {
		...structuredClone(defaultResumeData),
		picture: {
			...defaultResumeData.picture,
			size: 100,
			url: male ? "/photos/sample-picture.jpg" : "/photos/sample-woman.jpg",
		},
		basics: {
			name:
				name?.trim() || (male ? text("عبدالله القحطاني", "Abdullah Alqahtani") : text("سارة العتيبي", "Sara Alotaibi")),
			headline: male
				? text("مهندس برمجيات | تطوير تطبيقات الويب", "Software Engineer | Web Applications")
				: text("مهندسة برمجيات | تطوير تطبيقات الويب", "Software Engineer | Web Applications"),
			email: `${slug}@example.test`,
			phone: "+966 50 000 0000",
			location,
			website: { url: `https://${slug}.example.test`, label: `${slug}.example.test` },
			customFields: [],
		},
		summary: {
			...defaultResumeData.summary,
			content: text(
				"<p>نموذج توضيحي لشخصية مهنية خيالية. خبرة في تطوير تطبيقات الويب وتصميم واجهات سهلة الاستخدام، والعمل مع فرق متعددة التخصصات لتقديم منتجات موثوقة. اهتمام بجودة البرمجيات وإمكانية الوصول وتجربة المستخدم العربية.</p>",
				"<p>Fictional example profile. Software engineer with experience building accessible web applications and collaborating with cross-functional teams to deliver reliable products. Focused on software quality, maintainable systems and Arabic user experiences.</p>",
			),
		},
		metadata: {
			template: "azurill",
			layout: {
				sidebarWidth: 30,
				pages: [
					{
						fullWidth: false,
						main: ["summary", "education", "experience"],
						sidebar: ["profiles", "skills"],
					},
					{
						fullWidth: false,
						main: ["019becaf-0b87-769d-98a6-46ccf558c0e8", "awards"],
						sidebar: ["certifications", "languages", "interests", "references"],
					},
					{
						fullWidth: true,
						main: ["projects", "publications", "volunteer"],
						sidebar: [],
					},
				],
			},
			page: {
				gapX: 12,
				gapY: 8,
				marginX: 16,
				marginY: 16,
				format: "a4",
				locale: "en-US",
				hideLinkUnderline: false,
				hideIcons: false,
				hideSectionIcons: false,
			},
			design: {
				level: {
					icon: "star",
					type: "icon",
				},
				colors: {
					primary: "rgba(0, 112, 178, 1)",
					text: "rgba(0, 0, 0, 1)",
					background: "rgba(255, 255, 255, 1)",
				},
			},
			typography: {
				body: {
					fontFamily: "IBM Plex Serif",
					fontWeights: ["400", "600"],
					fontSize: 10,
					lineHeight: 1.5,
				},
				heading: {
					fontFamily: "Fira Sans Condensed",
					fontWeights: ["500"],
					fontSize: 12,
					lineHeight: 1.5,
				},
			},
			notes: "",
			styleRules: [],
		},
	};
	data.metadata.page.locale = ar ? "ar-SA" : "en-US";
	data.sections.profiles.items = [
		{
			...item("019bef5a-93e4-7746-ad39-3d42ddc9b4d8"),
			icon: "globe",
			iconColor: "",
			network: text("الملف المهني (مثال)", "Portfolio (example)"),
			username: slug,
			website: { url: `https://${slug}.example.test`, label: `${slug}.example.test`, inlineLink: false },
		},
	];
	data.sections.experience.items = [
		{
			...item("019bef5a-93e4-7746-ad39-44d8cec98ca4"),
			company: text("شركة آفاق التقنية (مثال)", "Afaq Technology (example)"),
			position: text("تطوير البرمجيات", "Software Engineer"),
			location,
			period: text("مارس 2022 – حتى الآن", "March 2022 – Present"),
			website,
			roles: [],
			description: text(
				"<ul><li>تطوير بوابة خدمات رقمية باستخدام React وTypeScript لتحسين تجربة المستفيدين.</li><li>التعاون مع فريق التصميم لضمان وضوح الواجهات ودعم العربية والإنجليزية.</li><li>كتابة اختبارات آلية ومراجعة الشيفرة لتحسين موثوقية الإصدارات.</li></ul>",
				"<ul><li>Developed a digital services portal with React and TypeScript.</li><li>Partnered with designers to deliver accessible Arabic and English interfaces.</li><li>Introduced automated tests and code reviews to improve release reliability.</li></ul>",
			),
		},
	];
	data.sections.education.items = [
		{
			...item("019bef5a-93e4-7746-ad39-48455f6cef9e"),
			school: text("جامعة الرياض الأهلية (مثال)", "Riyadh Private University (example)"),
			degree: text("بكالوريوس", "Bachelor of Science"),
			area: text("علوم الحاسب", "Computer Science"),
			grade: "4.5 / 5",
			location: text("الرياض", "Riyadh"),
			period: "2015 – 2019",
			website,
			description: text(
				"<p>مشروع التخرج: منصة إلكترونية لتنظيم الخدمات المجتمعية.</p>",
				"<p>Graduation project: an online platform for community services.</p>",
			),
		},
	];
	data.sections.projects.items = [
		{
			...item("019bef5a-93e4-7746-ad39-51100bb62391"),
			name: text("بوابة الخدمات الرقمية (مثال)", "Digital Services Portal (example)"),
			period: "2023 – 2024",
			website,
			description: text(
				"<p>تطبيق ويب ثنائي اللغة لإدارة الطلبات ومتابعة حالة الخدمات، مع اختبارات للإتاحة والأداء.</p>",
				"<p>A bilingual web application for service requests, with accessibility and performance tests.</p>",
			),
		},
	];
	data.sections.skills.items = [
		["React", "React", ["TypeScript", "JavaScript"]],
		["تطوير الويب", "Web development", ["HTML", "CSS", "REST APIs"]],
		["جودة البرمجيات", "Software quality", ["Playwright", "Vitest", "Git"]],
	].map(([arabic, english, keywords], index) => ({
		...item(`sample-skill-${index}`),
		icon: "",
		iconColor: "",
		name: text(arabic as string, english as string),
		proficiency: text("متقدم", "Advanced"),
		level: 4,
		keywords: keywords as string[],
	}));
	data.sections.languages.items = [
		{
			...item("sample-language-ar"),
			language: text("العربية", "Arabic"),
			fluency: text("اللغة الأم", "Native"),
			level: 5,
		},
		{
			...item("sample-language-en"),
			language: text("الإنجليزية", "English"),
			fluency: text("متقدم", "Advanced"),
			level: 4,
		},
	];
	data.sections.certifications.items = [
		{
			...item("sample-certification"),
			title: text("تطوير تطبيقات الويب (مثال)", "Web Application Development (example)"),
			issuer: text("أكاديمية مسار (مثال)", "Masar Academy (example)"),
			date: "2023",
			website,
			description: "",
		},
	];
	data.sections.awards.items = [
		{
			...item("sample-award"),
			title: text("جائزة التميز التقني (مثال)", "Technical Excellence Award (example)"),
			awarder: text("ملتقى التقنية السعودي (مثال)", "Saudi Technology Forum (example)"),
			date: "2024",
			website,
			description: "",
		},
	];
	data.sections.interests.items = [
		{
			...item("sample-interest"),
			icon: "book-open",
			iconColor: "",
			name: text("التعلم والمشاركة المجتمعية", "Learning and community"),
			keywords: [text("القراءة", "Reading"), text("المصادر المفتوحة", "Open source")],
		},
	];
	data.sections.references.items = [
		{
			...item("sample-reference"),
			name: text("متاحة عند الطلب", "Available on request"),
			position: "",
			website,
			phone: "",
			description: "",
		},
	];
	data.sections.publications.items = [
		{
			...item("sample-publication"),
			title: text("تصميم واجهات عربية سهلة الاستخدام (مثال)", "Designing accessible Arabic interfaces (example)"),
			publisher: text("مجلة التقنية (مثال)", "Technology Journal (example)"),
			date: "2024",
			website,
			description: "",
		},
	];
	data.sections.volunteer.items = [
		{
			...item("sample-volunteer"),
			organization: text("مبادرة مهارات رقمية (مثال)", "Digital Skills Initiative (example)"),
			location,
			period: "2021 – 2023",
			website,
			description: text(
				"<p>المشاركة في ورش تعريفية بأساسيات البرمجة لطلاب الجامعة.</p>",
				"<p>Supported introductory programming workshops for university students.</p>",
			),
		},
	];
	data.customSections = [
		{
			...defaultResumeData.sections.experience,
			id: "019becaf-0b87-769d-98a6-46ccf558c0e8",
			title: text("خبرات سابقة", "Earlier experience"),
			type: "experience",
			items: [
				{
					...item("019bef5a-d1fa-7289-a87c-2677688d9e75"),
					company: text("شركة مدارات الرقمية (مثال)", "Madarat Digital (example)"),
					position: text("تطوير واجهات المستخدم", "Frontend Developer"),
					location,
					period: text("يونيو 2019 – فبراير 2022", "June 2019 – February 2022"),
					website,
					roles: [],
					description: text(
						"<ul><li>بناء مكونات واجهة مشتركة وتوثيق استخدامها.</li><li>تحسين توافق صفحات الخدمات مع الأجهزة المحمولة.</li></ul>",
						"<ul><li>Built and documented shared interface components.</li><li>Improved mobile support for service pages.</li></ul>",
					),
				},
			],
		},
	];
	return data;
};

export const sampleResumeData: ResumeData = createSampleResumeData();
