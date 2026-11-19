import { resumeDataSchema, type ResumeData } from "@reactive-resume/schema/resume/data";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";

const employers = [
	["مختبر مدار السهل", "Madar Al-Sahl Lab"],
	["شركة أفق النخيل", "Ufuq Al-Nakheel"],
	["مكتب سهل الندى", "Sahl Al-Nada Office"],
	["استوديو وادي السحاب", "Wadi Al-Sahab Studio"],
	["شركة رمال البيانات", "Data Dunes"],
	["مختبر مسار الواحة", "Oasis Path Lab"],
	["شركة مرسى الأفكار", "Ideas Harbor"],
	["استوديو جسر الغد", "Tomorrow Bridge Studio"],
] as const;
const years = [2006, 2008, 2011, 2014, 2017, 2020, 2022, 2024, 2026];
const skillNames = [
	["تحليل البيانات", "Data analysis"],
	["عمليات المنتجات", "Product operations"],
	["تصميم التقارير", "Reporting"],
	["SQL", "SQL"],
	["تنسيق المشاريع", "Project coordination"],
	["توثيق الإجراءات", "Process documentation"],
	["التواصل", "Communication"],
	["تحسين الجودة", "Quality improvement"],
	["إدارة المخاطر", "Risk management"],
	["تخطيط الموارد", "Resource planning"],
	["تحليل المتطلبات", "Requirements analysis"],
	["التدريب", "Training"],
	["إدارة التغيير", "Change management"],
	["القيادة", "Leadership"],
	["تصميم الخدمات", "Service design"],
	["اختبار القبول", "Acceptance testing"],
	["الحوكمة", "Governance"],
	["كتابة الوثائق", "Technical writing"],
];

export function createDemoResume(arabic: boolean, tailored = false): ResumeData {
	const data = structuredClone(defaultResumeData);
	const t = (ar: string, en: string) => (arabic ? ar : en);
	const base = (kind: string, i: number) => ({ id: `demo-${kind}-${i}`, hidden: false });
	const website = (path: string) => ({
		url: `https://nawaf.sirawise.test/${path}`,
		label: t("ملف مهني", "Portfolio"),
		inlineLink: false,
	});
	const dates = (start: number, end: number) => ({ start: `${start}-01`, end: `${end}-01`, present: false });
	const description = (subject: string, i: number) =>
		`<p>${t("أبرز الإنجازات", "Key achievements")}: ${subject}.</p><ul>${[
			t(
				"حللت احتياجات الفرق وحددت المسؤوليات ومعايير القبول ضمن خطة تشغيل سنوية واضحة.",
				"Analyzed team needs, defined responsibilities and acceptance criteria within a clear annual operating plan.",
			),
			t(
				`نسقت مراجعات شهرية مع ${8 + i} فرق وسجلت القرارات والمخاطر وخطوات المتابعة في سجل مشترك.`,
				`Coordinated monthly reviews with ${8 + i} teams and recorded decisions, risks and follow-up actions in a shared register.`,
			),
			t(
				`صممت تقارير جودة أسبوعية وخفضت زمن إعدادها بنسبة ${15 + i}% باستخدام بيانات اختبار.`,
				`Designed weekly quality reports and reduced preparation time by ${15 + i}% using operational data.`,
			),
			t(
				"وثقت حالات الاستثناء وإجراءات التعافي ودربت زملاء جدد على مراجعة البيانات قبل التسليم.",
				"Documented exception cases and recovery procedures, then trained new colleagues to review data before handover.",
			),
			t(
				"قدمت نتائج قابلة للتتبع مع حدود واضحة للقياس ومراجعة ربع سنوية لتحديث الخطة وتحسين الخدمة.",
				"Presented traceable results with clear measurement limits and a quarterly review to update the plan and improve the service.",
			),
		]
			.map((line) => `<li>${line}</li>`)
			.join("")}</ul>`;
	data.basics = {
		name: t("نواف السهلي ", "Nawaf Al-Suhaili "),
		headline: tailored
			? "Product operations director | Reporting and service improvement"
			: t("مدير عمليات المنتجات وتحسين الخدمات", "Product operations and service improvement director"),
		email: "nawaf@sirawise.test",
		phone: "+966 50 000 0000",
		location: t("الرياض، المملكة العربية السعودية", "Riyadh, Saudi Arabia"),
		website: website("profile"),
		customFields: [
			{
				id: "demo-nationality",
				icon: "flag",
				text: t("سعودي", "Saudi"),
				link: "https://nawaf.sirawise.test/about",
			},
			{
				id: "demo-phone",
				icon: "phone",
				text: t("هاتف العمل: +966 11 000 0000", "Work phone: +966 11 000 0000"),
				link: "tel:+966110000000",
			},
		],
	};
	data.picture = { ...data.picture, hidden: false, url: "demo-avatar.png", size: 80, aspectRatio: 1, borderRadius: 15 };
	data.metadata.page.locale = arabic ? "ar-SA" : "en-US";
	data.metadata.typography.body.fontFamily = arabic ? "IBM Plex Sans Arabic" : "Carlito";
	data.metadata.typography.heading.fontFamily = arabic ? "IBM Plex Sans Arabic" : "Carlito";
	data.summary.content = `<p>${t(
		"مدير عمليات سعودي بخبرة عشرين عامًا من 2006 إلى 2026 في تحليل البيانات وتطوير الخدمات وقيادة فرق متعددة التخصصات. انتقلت من تنسيق العمليات إلى قيادة برامج التحسين والتدريب وإدارة المخاطر. أركز على وضوح المسؤوليات وقياس النتائج وتوثيق القرارات وتسليم المعرفة بين الفرق.",
		"Saudi operations director with twenty years of experience from 2006 to 2026 in data analysis, service development and multidisciplinary leadership. Progressed from operations coordination to improvement programs, training and risk management. I focus on clear ownership, measurable outcomes, decision records and knowledge transfer across teams.",
	)}</p>`;
	data.sections.experience.items = employers.map((names, i) => {
		const start = demoRequired(years[i]);
		const end = demoRequired(years[i + 1]);
		const position = t(
			demoRequired(
				[
					"منسق عمليات",
					"محلل عمليات",
					"محلل أول",
					"قائد فريق",
					"مدير مشاريع",
					"مدير برامج",
					"مدير عمليات",
					"مدير عمليات المنتجات",
				][i],
			),
			demoRequired(
				[
					"Operations coordinator",
					"Operations analyst",
					"Senior analyst",
					"Team lead",
					"Project manager",
					"Program manager",
					"Operations manager",
					"Product operations director",
				][i],
			),
		);
		return {
			...base("experience", i),
			company: names[arabic ? 0 : 1],
			position,
			location: t("الرياض", "Riyadh"),
			period: `${start} - ${end}`,
			dates: dates(start, end),
			website: website(`experience/${i}`),
			description: description(position, i),
			roles: [
				{
					id: `demo-role-${i}`,
					position,
					period: `${start} - ${end}`,
					dates: dates(start, end),
					description: description(t("مسؤوليات الدور", "Role responsibilities"), i),
				},
			],
		};
	});
	data.sections.education.items = [2006, 2012, 2021].map((year, i) => ({
		...base("education", i),
		school: t(`معهد واحة المعرفة ${i + 1}`, `Knowledge Oasis Institute ${i + 1}`),
		degree: t(
			demoRequired(["بكالوريوس", "دبلوم مهني", "ماجستير"][i]),
			demoRequired(["Bachelor degree", "Professional diploma", "Master degree"][i]),
		),
		area: t("نظم المعلومات وإدارة العمليات", "Information systems and operations"),
		grade: "4.6/5",
		location: t("الرياض", "Riyadh"),
		period: `${year - 2} - ${year}`,
		dates: dates(year - 2, year),
		website: website(`education/${i}`),
		description: description(t("مشروع التخرج", "graduation project"), i),
	}));
	data.sections.projects.items = Array.from({ length: 6 }, (_, i) => ({
		...base("project", i),
		name: t(`منصة قياس الخدمة ${i + 1}`, `service measurement platform ${i + 1}`),
		period: `${2014 + i} - ${2015 + i}`,
		dates: dates(2014 + i, 2015 + i),
		website: website(`projects/${i}`),
		description: description(t("تطوير لوحة مؤشرات وتسليم موثق", "Metrics dashboard and documented handover"), i),
	}));
	data.sections.skills.items = skillNames.map((names, i) => ({
		...base("skill", i),
		icon: "compass-tool",
		iconColor: "rgba(35, 90, 90, 1)",
		name: demoRequired(names[arabic ? 0 : 1]),
		proficiency: t("متقدم", "Advanced"),
		level: 3 + (i % 3),
		keywords: t("قياس,توثيق,مراجعة", "Measurement,Documentation,Review").split(","),
	}));
	data.sections.languages.items = [
		{ ...base("language", 0), language: t("العربية", "Arabic"), fluency: t("اللغة الأم", "Native"), level: 5 },
		{
			...base("language", 1),
			language: t("الإنجليزية", "English"),
			fluency: t("إجادة مهنية", "Professional"),
			level: 4,
		},
	];
	data.sections.profiles.items = ["portfolio", "writing", "community"].map((network, i) => ({
		...base("profile", i),
		icon: "globe",
		iconColor: "rgba(35, 90, 90, 1)",
		network: t(demoRequired(["الأعمال", "المقالات", "المجتمع"][i]), network),
		username: "nawaf-alsuhaili",
		website: website(network),
	}));
	data.sections.certifications.items = Array.from({ length: 6 }, (_, i) => ({
		...base("certificate", i),
		title: t(`شهادة في تحسين العمليات ${i + 1}`, `operations improvement certificate ${i + 1}`),
		issuer: t("أكاديمية المسار", "Path Academy"),
		date: `${2017 + i}-05`,
		dates: { start: `${2017 + i}-05`, end: null, present: false },
		website: website(`certificates/${i}`),
		description: `<p>${t("تدريب على تحليل الإجراءات وقياس النتائج.", "Training covered process analysis and outcome measurement.")}</p>`,
	}));
	data.sections.awards.items = Array.from({ length: 4 }, (_, i) => ({
		...base("award", i),
		title: t(`جائزة جودة الخدمة ${i + 1}`, `service quality award ${i + 1}`),
		awarder: t("مجلس الواحة", "Oasis Council"),
		date: `${2018 + i}-06`,
		dates: { start: `${2018 + i}-06`, end: null, present: false },
		website: website(`awards/${i}`),
		description: `<p>${t("تكريم لفريق تحسين التقارير وتسليم المعرفة.", "Team recognition for reporting improvement and knowledge transfer.")}</p>`,
	}));
	data.sections.publications.items = Array.from({ length: 3 }, (_, i) => ({
		...base("publication", i),
		title: t(`دليل لقياس العمليات ${i + 1}`, `operations measurement guide ${i + 1}`),
		publisher: t("مجلة المسار", "Path Journal"),
		date: `${2020 + i}-09`,
		dates: { start: `${2020 + i}-09`, end: null, present: false },
		website: website(`publications/${i}`),
		description: `<p>${t("مقال يشرح تصميم مؤشرات قابلة للتتبع وحدود المقارنة بين الفرق.", "An article explaining traceable indicators and limits when comparing teams.")}</p>`,
	}));
	data.sections.volunteer.items = Array.from({ length: 3 }, (_, i) => ({
		...base("volunteer", i),
		organization: t(`مبادرة درب المعرفة ${i + 1}`, `Knowledge Trail Initiative ${i + 1}`),
		location: t("الرياض", "Riyadh"),
		period: `${2018 + i} - ${2019 + i}`,
		dates: dates(2018 + i, 2019 + i),
		website: website(`volunteering/${i}`),
		description: description(t("تدريب متطوعين على إعداد التقارير", "Volunteer reporting training"), i),
	}));
	data.sections.references.items = [
		["فهد الواحي", "Fahad Al-Wahi"],
		["لينا السحاب", "Lina Al-Sahab"],
		["سالم الرملي", "Salem Al-Ramli"],
	].map((names, i) => ({
		...base("reference", i),
		name: `${names[arabic ? 0 : 1]} ${t("", "")}`,
		position: t("مراجع مهني", "professional reviewer"),
		website: website(`references/${i}`),
		phone: `+966 50 000 000${i + 1}`,
		description: `<p>${t("مرجع مهني وزميل سابق.", "Professional reference and former colleague.")} reviewer${i + 1}@sirawise.test</p>`,
	}));
	data.sections.interests.items = [
		["القراءة", "Reading"],
		["المشي", "Walking"],
		["الخط العربي", "Calligraphy"],
		["الشطرنج", "Chess"],
		["الفلك", "Astronomy"],
		["الزراعة", "Gardening"],
	].map((names, i) => ({
		...base("interest", i),
		icon: "star",
		iconColor: "rgba(35, 90, 90, 1)",
		name: demoRequired(names[arabic ? 0 : 1]),
		keywords: t("تعلم,مشاركة", "Learning,Sharing").split(","),
	}));
	const sectionTitles = {
		profiles: ["الملفات المهنية", "Profiles"],
		experience: ["الخبرات", "Experience"],
		education: ["التعليم", "Education"],
		projects: ["المشاريع", "Projects"],
		skills: ["المهارات", "Skills"],
		languages: ["اللغات", "Languages"],
		interests: ["الاهتمامات", "Interests"],
		awards: ["الجوائز", "Awards"],
		certifications: ["الشهادات", "Certifications"],
		publications: ["المنشورات", "Publications"],
		volunteer: ["التطوع", "Volunteering"],
		references: ["المراجع المهنية", "References"],
	};
	for (const [key, section] of Object.entries(data.sections)) {
		section.hidden = false;
		const title = sectionTitles[key as keyof typeof sectionTitles];
		section.title = demoRequired(title[arabic ? 0 : 1]);
	}
	data.summary.title = t("الملخص المهني", "Professional summary");
	const types = ["summary", ...Object.keys(data.sections), "cover-letter"] as const;
	data.customSections = types.map((type, i) => {
		const item =
			type === "summary"
				? {
						...base("custom-summary", i),
						content: `<p>${t("خطة تطوير مهني تشمل التعلم والتوجيه وتقييم النتائج.", "development plan covering learning, mentoring and outcome review.")}</p>`,
					}
				: type === "cover-letter"
					? {
							...base("custom-letter", i),
							recipient: `<p>${t("فريق التوظيف", "hiring team")}<br>hiring@sirawise.test</p>`,
							content: `<p>${t("أقدم خبرتي في تحسين العمليات وقيادة الفرق لمناقشة فرص التعلم والتطوير.", "I offer my experience in operations improvement and team leadership to discuss learning and development opportunities.")}</p>`,
						}
					: {
							...structuredClone(data.sections[type as keyof typeof data.sections].items[0]),
							id: `demo-custom-item-${i}`,
						};
		return {
			id: `demo-custom-${type}`,
			type,
			title: t(`قسم إضافي ${i + 1}`, `Additional ${type}`),
			icon: "star",
			columns: 1,
			hidden: false,
			showHeading: true,
			items: [item],
		};
	}) as ResumeData["customSections"];
	demoRequired(data.metadata.layout.pages[0]).main.push(...data.customSections.map((section) => section.id));
	return resumeDataSchema.parse(data);
}

export function demoRequired<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("DEMO_FIXTURE_VALUE_MISSING");
	return value;
}
