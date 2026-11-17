// @vitest-environment happy-dom
import type { Application } from "../types";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { ApplicationPicker } from "./application-picker";
import { getUiLocaleMessages } from "@/libs/locale";

afterEach(cleanup);
const uuid = "a9753d88-91b3-48b4-a23e-6238ffb9ce6a";
const job = (id: string, company: string, days: number, status = "saved") =>
	({ id, company, role: `Engineer ${id}`, status, updatedAt: new Date(Date.now() - days * 86400000) }) as Application;

it.each(["ar-SA", "en-US"])(
	"%s: searches safe names, sorts recent first, and preserves a selected closed job",
	async (locale) => {
		i18n.loadAndActivate(await getUiLocaleMessages(locale as "ar-SA" | "en-US"));
		const onValueChange = vi.fn();
		render(
			<I18nProvider i18n={i18n}>
				<ApplicationPicker
					aria-label="Application"
					applications={[
						job("old", "Older Co", 8),
						job("uuid", uuid, 3),
						job("closed", "Closed Co", 1, "closed"),
						job("hidden", "Hidden Co", 0, "closed"),
						job("recent", `Recent Co ${uuid}`, 0),
						...Array.from({ length: 5 }, (_, i) => job(`extra${i}`, `Extra ${i}`, 5)),
					]}
					value="closed"
					onValueChange={onValueChange}
				/>
			</I18nProvider>,
		);
		const user = userEvent.setup();
		await user.click(screen.getByRole("combobox", { name: "Application" }));
		expect(screen.getAllByRole("option")[0]).toHaveTextContent("Engineer recent");
		expect(screen.queryByText(/Hidden Co/)).toBeNull();
		expect(screen.getByRole("option", { name: /Engineer uuid/ })).not.toHaveTextContent(uuid);
		expect(screen.getByRole("option", { name: /Engineer recent/ })).toHaveTextContent(`Recent Co ${uuid}`);
		const closed = screen.getByRole("option", { name: /Engineer closed/ });
		expect(closed).toHaveTextContent(locale === "ar-SA" ? "مغلق" : "Closed");
		expect(closed.querySelector("[data-slot=stage-dot]")).not.toBeNull();
		expect(screen.getByRole("option", { name: /Engineer uuid/ }).querySelector("time")?.textContent).not.toMatch(
			/[٠-٩]/u,
		);
		await user.type(screen.getByRole("combobox", { name: "" }), "Recent Co");
		expect(screen.getAllByRole("option")).toHaveLength(1);
		await user.click(screen.getByRole("option"));
		expect(onValueChange).toHaveBeenCalledWith("recent");
	},
);

it("honors an uncontrolled default and retains a linked closed application", async () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	render(
		<I18nProvider i18n={i18n}>
			<ApplicationPicker
				aria-label="Application"
				applications={[job("open", "Open Co", 0), job("closed", "Closed Co", 1, "closed")]}
				defaultValue="closed"
			/>
		</I18nProvider>,
	);
	const picker = screen.getByRole("combobox", { name: "Application" });
	expect(picker).toHaveTextContent("Engineer closed");
	await userEvent.click(picker);
	await userEvent.click(screen.getByRole("option", { name: /Engineer open/ }));
	expect(picker).toHaveTextContent("Engineer open");
});
