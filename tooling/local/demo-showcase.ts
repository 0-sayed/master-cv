import { parseResumeData, type ResumeData } from "@reactive-resume/schema/resume/data";
import { createDemoResume, demoRequired } from "./demo-resume";

const bullets = (lines: string[]) => `<ul>${lines.map((line) => `<li>${line}</li>`).join("")}</ul>`;
const noWebsite = () => ({ url: "", label: "", inlineLink: false });
const achievements = [
	[
		"نسق مراجعات التشغيل مع 8 فرق وسجل القرارات وخطوات المتابعة في سجل مشترك.",
		"خفض وقت إعداد التقارير بنسبة 15% عبر تنظيم بيانات التشغيل قبل المراجعة.",
	],
	[
		"حلل احتياجات 9 فرق وحدد مسؤوليات المراجعة ومعايير قبول بيانات التقارير.",
		"طور تقارير الجودة الأسبوعية وخفض وقت إعدادها بنسبة 16%.",
	],
	[
		"صمم آلية مراجعة للبيانات خفضت زمن إعداد التقارير بنسبة 17%.",
		"ربط ملاحظات 10 فرق بسجل المخاطر ووثق حالات الاستثناء قبل التسليم.",
	],
	[
		"قاد مراجعات شهرية مع 11 فريقًا وحدد ملاك القرارات ومسؤوليات المتابعة.",
		"حسن خطوات إعداد تقارير الجودة وخفض زمنها بنسبة 18% مع تدريب الزملاء على المراجعة.",
	],
	[
		"وحد معايير قبول التسليم بين 12 فريقًا ضمن خطة تشغيل سنوية واضحة.",
		"خفض وقت إعداد التقارير بنسبة 19% ووثق إجراءات التعافي لمعالجة حالات الاستثناء.",
	],
	[
		"نظم مراجعات البرامج مع 13 فريقًا وربط القرارات بمخاطر التشغيل وخطوات التعافي.",
		"طور متابعة مؤشرات الجودة وخفض زمن إعداد التقارير بنسبة 20%.",
	],
	[
		"قاد تنسيق العمليات بين 14 فريقًا ووثق مسؤوليات المتابعة والتسليم.",
		"خفض زمن إعداد تقارير الجودة بنسبة 21% باستخدام بيانات التشغيل ومراجعة الإجراءات ربع السنوية.",
	],
	[
		"خفض زمن إعداد التقارير بنسبة 22% عبر توحيد متطلبات البيانات ومعايير المراجعة.",
		"نسق مراجعات شهرية مع 15 فريقًا وربط مؤشرات الخدمة بسجل القرارات والمخاطر وخطة التحسين.",
	],
];
const draftDuties = [
	"كنت مسؤولًا عن متابعة تقارير المنتج والتواصل مع الفرق للتأكد من وصول المعلومات إلى الإدارة. أشارك في الاجتماعات الدورية وأراجع الملاحظات الواردة ثم أتابع الموضوع مع الزملاء حتى ينتهي. أرى أن خبرتي تساعدني في التعامل مع ضغط العمل وتغير الأولويات، وأهتم بتطوير نفسي وتحمل المسؤولية.",
	"كنت مسؤولًا عن متابعة العمل اليومي وتجميع احتياجات الإدارات ومراجعة الإجراءات المستخدمة. أساعد الفريق في تجهيز تقارير الجودة وأرسل الملاحظات إلى المدير وأتابع الطلبات المفتوحة. شاركت في تدريب الزملاء الجدد على الإجراءات وكنت أتعاون معهم لحل المشكلات التي تظهر أثناء التسليم والحفاظ على سير العمل.",
	"من مهامي التنسيق بين فرق البرامج وتحديد مواعيد الاجتماعات وإعداد محاضرها. كنت أراجع التقارير قبل مشاركتها وأتابع الملاحظات مع أصحاب العلاقة. تعلمت التعامل مع طلبات متعددة في الوقت نفسه والبحث عن حلول عملية، وشاركت في توثيق المخاطر وإجراءات التعافي عندما تتغير متطلبات العمل.",
	"شاركت في متابعة المشاريع والتواصل مع الفرق وتجهيز المعلومات المطلوبة للاجتماعات. كنت مسؤولًا عن مراجعة متطلبات التسليم وإرسال الملاحظات ومتابعة الردود. أساعد الزملاء في فهم الإجراءات وأتعاون معهم عند تغير الأولويات، وأرى أن هذه التجربة طورت قدرتي على تنظيم العمل والتعامل مع الجهات المختلفة.",
	"كنت أتابع توزيع المهام وحضور الاجتماعات وأراجع ما يرسله الزملاء من تقارير. ساعدت في كتابة الإجراءات والرد على الأسئلة التي تصل إلى الفريق. أحرص على التواصل المستمر مع أصحاب العلاقة ومعالجة الملاحظات، وشاركت في تدريب الموظفين الجدد على متابعة الطلبات ومراجعة البيانات قبل التسليم.",
	"عملت على مراجعة بيانات التشغيل وإعداد التقارير المطلوبة ومتابعة الملاحظات مع الفرق. كنت أشارك في الاجتماعات وأجهز المعلومات التي يحتاجها المدير لاتخاذ القرار. ساعدت الزملاء في توثيق حالات الاستثناء وتنظيم الملفات، وتعلمت أهمية مراجعة البيانات والتأكد من وضوح المسؤوليات قبل مشاركة التقرير مع الإدارات.",
	"كنت أساعد في تجميع بيانات التشغيل وتنسيق الملاحظات وإعداد التقارير الأسبوعية. أتابع النواقص مع الزملاء وأشارك في الاجتماعات عندما يطلب مني ذلك. ساهمت في تحديث الوثائق ومراجعة الطلبات الواردة وتعلمت التعامل مع فرق متعددة، وكانت هذه التجربة أساسًا جيدًا لتطوير مهاراتي في التحليل وتنظيم العمل.",
];

function professionalResume(): ResumeData {
	const data = createDemoResume(true);
	data.basics.name = data.basics.name.trim();
	data.basics.customFields = [];
	data.basics.website = {
		url: "https://nawaf.sirawise.test/profile",
		label: "https://nawaf.sirawise.test/profile",
	};
	data.picture.hidden = true;
	data.picture.url = "";
	data.customSections = [];
	for (const [key, section] of Object.entries(data.sections)) {
		if (["experience", "education", "skills", "languages"].includes(key)) continue;
		section.hidden = true;
		section.items = [];
	}
	data.summary.content =
		"<p>مدير عمليات المنتجات وتحسين الخدمات بخبرة 20 عامًا في الرياض، من تنسيق العمليات إلى قيادة برامج التحسين. خفض زمن إعداد التقارير بنسبة 22% ونسق مراجعات مع 15 فريقًا. يجمع بين تحليل البيانات وإدارة المخاطر وتوثيق القرارات لتسليم خدمات قابلة للقياس.</p>";
	data.sections.experience.items = data.sections.experience.items
		.map((item, index) => ({
			...item,
			website: noWebsite(),
			roles: [],
			description: bullets(demoRequired(achievements[index])),
		}))
		.reverse();
	data.sections.education.items = data.sections.education.items
		.map((item) => ({
			...item,
			website: noWebsite(),
			description: "",
			grade: "",
		}))
		.reverse();
	const skill = demoRequired(data.sections.skills.items[0]);
	data.sections.skills.items = [
		{
			...skill,
			id: "showcase-analysis",
			name: "تحليل البيانات والتقارير",
			proficiency: "",
			level: 0,
			keywords: ["SQL", "تحليل البيانات", "تصميم التقارير", "تحسين الجودة"],
		},
		{
			...skill,
			id: "showcase-operations",
			name: "إدارة العمليات",
			proficiency: "",
			level: 0,
			keywords: ["عمليات المنتجات", "إدارة المخاطر", "تخطيط الموارد", "توثيق الإجراءات"],
		},
		{
			...skill,
			id: "showcase-leadership",
			name: "قيادة الفرق",
			proficiency: "",
			level: 0,
			keywords: ["التدريب", "إدارة التغيير", "تحليل المتطلبات", "اختبار القبول"],
		},
	];
	data.sections.skills.columns = 1;
	data.sections.languages.columns = 1;
	data.metadata.template = "onyx";
	data.metadata.layout.pages = [
		{ fullWidth: true, main: ["summary", "experience", "skills", "education", "languages"], sidebar: [] },
	];
	data.metadata.page.dateFormat = "iso";
	data.metadata.page.marginX = 36;
	data.metadata.page.marginY = 36;
	data.metadata.page.hideIcons = true;
	data.metadata.typography.body = {
		...data.metadata.typography.body,
		fontSize: 11,
		lineHeight: 1.4,
		fontWeights: ["400"],
	};
	data.metadata.typography.heading = {
		...data.metadata.typography.heading,
		fontSize: 14,
		lineHeight: 1.4,
		fontWeights: ["700"],
	};
	return parseResumeData(data);
}

function draftResume(strong: ResumeData): ResumeData {
	const data = structuredClone(strong);
	data.basics.phone = "";
	data.basics.website = noWebsite();
	data.basics.headline = "خبرة في العمليات والتقارير والتنسيق";
	data.summary.content =
		"<p>أنا أبحث عن فرصة مناسبة أستفيد فيها من خبرتي في متابعة العمل اليومي وإعداد التقارير والتعامل مع الفرق المختلفة. أرى أنني أستطيع تحمل المسؤولية والعمل تحت الضغط، وأهتم بالتعلم وتطوير نفسي والمشاركة مع الزملاء في حل المشكلات التي تواجه العمل.</p>";
	data.sections.experience.title = "رحلتي";
	data.sections.skills.title = "ما أجيده";
	data.sections.experience.items = data.sections.experience.items.map((item, index) => ({
		...item,
		description: index === 7 ? "" : bullets([demoRequired(draftDuties[index])]),
	}));
	const unresolved = demoRequired(data.sections.experience.items[0]);
	unresolved.period = "بداية المشروع - حتى تسليم الخدمة";
	unresolved.dates = { start: null, end: null, present: false, raw: unresolved.period };
	const undated = demoRequired(data.sections.experience.items[7]);
	undated.period = "";
	undated.dates = { start: null, end: null, present: false };
	for (const index of [2, 3]) {
		const item = demoRequired(data.sections.experience.items[index]);
		const start = demoRequired(item.dates?.start ?? undefined).slice(0, 4);
		const end = demoRequired(item.dates?.end ?? undefined).slice(0, 4);
		item.period = `يناير ${start} - يناير ${end}`;
		item.dates = { ...demoRequired(item.dates), raw: item.period };
	}
	data.metadata.template = "azurill";
	data.metadata.layout.pages = [
		{ fullWidth: false, main: ["education", "skills", "languages"], sidebar: ["summary", "experience"] },
	];
	data.metadata.layout.sidebarWidth = 55;
	data.metadata.page.marginX = 2;
	data.metadata.page.marginY = 2;
	data.metadata.typography.body.fontSize = 8;
	data.metadata.typography.body.lineHeight = 1;
	return parseResumeData(data);
}

const strong = professionalResume();
export const demoShowcaseResumes = [
	{ name: "سيرة قبل التحسين", data: draftResume(strong) },
	{ name: "سيرة احترافية", data: strong },
] as const;
