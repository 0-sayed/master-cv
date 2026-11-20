// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { expect, it } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { careerMasterSchema } from "@reactive-resume/schema/career-master";
import { CareerCompleteness } from "./completeness";
import { loadUiLocale } from "@/libs/locale";

it("shows the career completeness hint in Arabic", async () => {
	await loadUiLocale("ar-SA");
	const facts = ["skills", "languages"].map((section, index) => ({
		id: `${section}-fact`,
		revision: 1,
		draftRevision: 0,
		status: "active" as const,
		confirmation: "confirmed" as const,
		text: "Saved value",
		structured: {
			section,
			entityId: `${section}-${index}`,
			field: section === "skills" ? "name" : "language",
			value: "Saved value",
			source: { kind: "manual" as const, id: "test", quote: "Saved value" },
		},
		proposedStructured: null,
		source: { kind: "manual" as const, id: "test", quote: "Saved value" },
	}));
	const master = careerMasterSchema.parse({ profileRevision: 0, sections: [], facts, summary: "Saved summary" });
	render(
		<I18nProvider i18n={i18n}>
			<CareerCompleteness master={master} />
		</I18nProvider>,
	);
	expect(screen.getByRole("link")).toHaveTextContent("أضف بيانات التواصل للوصول إلى 60%");
});
