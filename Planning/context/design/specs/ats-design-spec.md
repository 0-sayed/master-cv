# ATS readiness: design spec (2026-11-03)

Keep it small: extend existing screens, no new routes. Arabic RTL first, desktop 1440 + mobile 390, existing tokens/components, Latin digits, no em dash, never a universal "ATS score" or "passes ATS" claim.

Unfamiliar section headings are warnings unless demonstrated extraction/reading failure justifies a blocker. Findings never prevent download.

## Component (Components page, Feedback & status section)

- `Check finding` row: severity marker (Blocker = danger "يمنع القراءة", Warning = warn "تحذير", Tip = info "نصيحة") as icon + word, title (what is wrong), one line "لماذا يهم", optional evidence line (page / field), actions: "إصلاح" (safe one-click fix) or "مراجعة" (opens the field), and "تجاهل" for tips. Variants: Severity=Blocker|Warning|Tip, State=Open|Fixed|Ignored, Dir=RTL|LTR. Description with use + developer invariant.
- `Check summary` block: three separate result chips, never combined: "قابلية قراءة الملف" (counts by severity), "ملاحظات الكتابة" (tips count), "الأدلة لهذه الوظيفة" (only when a job is selected: covered / missing terms). Variant: State=NotChecked|Checking|Partial|Ready|Stale|Failed|Skipped. Each result has its own state: an unrun or skipped check has no positive result; partial results label the unavailable checks. These required recovery states still need publication and live Figma verification before UI implementation.

## Screens and states (desktop + mobile, named `Sxx · Title: state`)

- S10 · Review overview (existing): add the check summary at the top and a findings list grouped by the three results. New states: `ATS checking` (spinner, "نحلل النص المستخرج من ملف PDF"), `ATS issues found` (1 blocker: "النص العربي يُقرأ بترتيب معكوس في الصفحة 1"; 3 warnings: "عناوين الأقسام غير معروفة: «مسيرتي»", "تواريخ غير واضحة: 1445", "أعمدة جانبية"; 3 tips), `ATS no blockers` (honest copy: "لم نجد مشكلات في قراءة الملف. هذا لا يضمن قبول الطلب لدى كل جهة توظيف."), `ATS result stale` ("عدّلت السيرة بعد آخر فحص. أعد الفحص."), `ATS check failed` (retry; nothing changed).
- S12 · Export (existing): add a small readability line above the download: blocker present → "توجد مشكلة قد تمنع قراءة الملف" / "1 issue may prevent the file from being read" + "عرض المشكلات" (opens S10 ATS issues found); never block download. New state: `ATS blockers before download`.
- S20 · Job evidence (existing): no change except a note linking job-term coverage as the third result (only if the master lacks it).
- Arabic copy for findings (use exactly these examples): "عناوين الأقسام غير معروفة" / "استخدم عناوين واضحة مثل: الخبرات العملية، التعليم، المهارات"; "النص العربي يُقرأ بترتيب معكوس" / "قد تقرأ أنظمة التوظيف الأسطر بترتيب خاطئ"; "تواريخ غير واضحة: 1445" / "حدّد هل التاريخ هجري أم ميلادي"; "أعمدة جانبية" / "قد تُقرأ الأعمدة بترتيب مختلف؛ القالب ذو العمود الواحد أكثر أمانًا".

## Prototype (both prototypes)

- S10 gains a "فحص الملف" action → `Popup · Simulator: ATS check` (prototype-only) with options: "توجد مشكلات" → S10 ATS issues found; "لا مشكلات" → S10 ATS no blockers; "تعذّر الفحص" → S10 ATS check failed (retry → simulator again). In S10 ATS issues found, "إصلاح" on the heading finding → S10 ATS no blockers is NOT allowed (the reading-order blocker remains); instead it shows the row as Fixed via component CHANGE_TO. "مراجعة" on the reading-order finding → S09 · Editor: design (template choice). S12 "عرض المشكلات" → S10 ATS issues found.
- User Flows: J1 card adds branch cards for the new S10/S12 states (from step "مراجعة" → back to step "مراجعة"/"تصدير").
- inventory.json: add the new states to S10 and S12, component names, popup "Simulator: ATS check".

## Final bilingual issue fixture

- S10 summary: «عائق واحد للقراءة · 3 تحذيرات» / “1 reading blocker · 3 warnings”. Expanded summary: «قابلية قراءة الملف · عائق واحد للقراءة · 3 تحذيرات» / “PDF readability · 1 reading blocker · 3 warnings”.
- S12 above download: «توجد مشكلة قد تمنع قراءة الملف» / “1 issue may prevent the file from being read”; action «عرض المشكلات» / “View issues”.
- Heading warning: «عناوين الأقسام غير معروفة» / “Section headings are not recognized”. Arabic reading order is the sole blocker; unclear dates and side columns are warnings. Download remains available.
