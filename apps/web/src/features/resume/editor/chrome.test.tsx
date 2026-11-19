import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vite-plus/test";
import { DocumentMenuTrigger } from "./chrome";
import { getUiLocaleMessages } from "@/libs/locale";

it("keeps the full document name available when the editor switcher truncates it", async () => {
	const name = "A long document name for an application with Arabic and English content";
	i18n.loadAndActivate(await getUiLocaleMessages("en-US"));
	render(
		<I18nProvider i18n={i18n}>
			<DocumentMenuTrigger name={name} isLocked />
		</I18nProvider>,
	);
	const button = screen.getByRole("button", { name: `Document menu: ${name}` });
	expect(button).toHaveAttribute("data-variant", "ghost");
	expect(screen.getByText(name)).toHaveAttribute("dir", "auto");
	await userEvent.hover(button);
	expect(await screen.findByRole("tooltip")).toHaveTextContent(name);
});
// @vitest-environment happy-dom
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
