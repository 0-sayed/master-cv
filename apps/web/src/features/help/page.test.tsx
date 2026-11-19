// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelpPage } from "./page";
import { getUiLocaleMessages } from "@/libs/locale";
const { messages: arabic } = await getUiLocaleMessages("ar-SA");

const submit = vi.hoisted(() => vi.fn());
const context = vi.hoisted(() => ({ session: null as null | { user: { email: string; emailVerified: boolean } } }));
vi.mock("@tanstack/react-router", () => ({ useRouteContext: () => context }));
vi.mock("@/libs/orpc/client", () => ({ client: { privacy: { support: submit } } }));
vi.mock("./public-shell", () => ({
	PublicShell: ({ children }: { children: import("react").ReactNode }) => <main>{children}</main>,
}));
afterEach(() => {
	cleanup();
	submit.mockReset();
	context.session = null;
});
function show(locale = "en-US") {
	i18n.loadAndActivate({ locale, messages: locale === "ar-SA" ? arabic : {} });
	render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={new QueryClient()}>
				<HelpPage user={context.session?.user ?? null} />
			</QueryClientProvider>
		</I18nProvider>,
	);
}
function fill() {
	fireEvent.change(screen.getByLabelText("Your email"), { target: { value: "reader@example.test" } });
	fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "Synthetic support question" } });
}
it.each(["ar-SA", "en-US"])("links signed-in owners to the Review guide in %s", (locale) => {
	context.session = { user: { email: "reader@example.test", emailVerified: true } };
	show(locale);
	expect(screen.getByRole("link", { name: locale === "ar-SA" ? "دليل المراجعة" : "Review guide" })).toHaveAttribute(
		"href",
		`/dashboard/review-guide?locale=${locale}`,
	);
});
it.each(["ar-SA", "en-US"])("preserves %s in unverified-account recovery", (locale) => {
	context.session = { user: { email: "reader@example.test", emailVerified: false } };
	show(locale);
	const link = screen.getByRole("link", {
		name: locale === "ar-SA" ? "تأكيد بريدك الإلكتروني" : "Verify your email address",
	});
	const url = new URL(link.getAttribute("href") ?? "", "https://resume.example");
	expect(url.searchParams.get("locale")).toBe(locale);
	expect(url.searchParams.get("email")).toBe("reader@example.test");
});
it("signed-out intake only shows receipt after persistence", async () => {
	let done!: (value: unknown) => void;
	submit.mockImplementation(
		() =>
			new Promise((resolve) => {
				done = resolve;
			}),
	);
	show();
	fill();
	fireEvent.click(screen.getByRole("button", { name: "Send message" }));
	expect(screen.queryByText("Message received")).toBeNull();
	await waitFor(() => expect(submit).toHaveBeenCalledOnce());
	done({ id: "case", status: "received" });
	expect(await screen.findByText("Message received")).toBeDefined();
	expect(screen.getByRole("status")).toHaveFocus();
	expect(screen.getByText(/does not mean/)).toBeDefined();
	fireEvent.click(screen.getByRole("button", { name: "Send another message" }));
	expect(screen.getByLabelText("Your message")).toHaveValue("");
});
it("failure preserves message for retry", async () => {
	submit.mockRejectedValue(new Error("offline"));
	show();
	fill();
	fireEvent.click(screen.getByRole("button", { name: "Send message" }));
	expect(await screen.findByRole("alert")).toBeDefined();
	expect(screen.getByLabelText("Your message")).toHaveValue("Synthetic support question");
	expect(screen.queryByText("Message received")).toBeNull();
});
it("FAQ keeps PDF and interface-language independence explicit", () => {
	show();
	expect(screen.getByText("In the editor, choose Export, then PDF.")).toBeDefined();
	expect(screen.getByText("No. Interface language does not change your CV content.")).toBeDefined();
	expect(screen.queryByText("The final privacy policy is not available yet.")).toBeNull();
	expect(screen.queryByText("Draft pending owner approval")).toBeNull();
	expect(screen.queryByText("The privacy policy and retention periods will be published before launch.")).toBeNull();
});

it("retries unchanged content with the same nonce and edits with a new nonce", async () => {
	submit.mockRejectedValue(new Error("offline"));
	show();
	fill();
	const send = screen.getByRole("button", { name: "Send message" });
	fireEvent.click(send);
	await screen.findByRole("alert");
	const first = submit.mock.calls[0]?.[0].requestNonce;
	expect(first).toBeTypeOf("string");
	fireEvent.click(send);
	await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
	expect(submit.mock.calls[1]?.[0].requestNonce).toBe(first);
	await waitFor(() => expect(send).not.toBeDisabled());
	fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "Edited support question" } });
	fireEvent.click(send);
	await waitFor(() => expect(submit).toHaveBeenCalledTimes(3));
	expect(submit.mock.calls[2]?.[0].requestNonce).not.toBe(first);
});

it("offers verification recovery to an unverified signed-in owner", () => {
	context.session = { user: { email: "pending@example.test", emailVerified: false } };
	show();
	expect(screen.queryByRole("button", { name: "Send message" })).toBeNull();
	expect(screen.getByRole("link", { name: "Verify your email address" })).toHaveAttribute(
		"href",
		"/auth/verify-email?email=pending%40example.test&locale=en-US",
	);
});

it.each([
	["Export problem", "export"],
	["Plan question", "plan"],
	["Privacy & data", "privacy"],
	["Other", "other"],
])("persists the selected %s subject", async (label, subject) => {
	submit.mockResolvedValue({ id: "receipt", status: "received" });
	show();
	fill();
	fireEvent.click(screen.getByRole("radio", { name: label }));
	fireEvent.click(screen.getByRole("button", { name: "Send message" }));
	await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ subject, locale: "en-US" })));
});
it("shows inline errors and focuses the first invalid field without native validation", () => {
	show();
	const email = screen.getByLabelText("Your email");
	const message = screen.getByLabelText("Your message");
	expect(email.closest("form")).toHaveAttribute("novalidate");
	fireEvent.click(screen.getByRole("button", { name: "Send message" }));
	expect(email).toHaveFocus();
	expect(email).toHaveAttribute("aria-invalid", "true");
	expect(message).toHaveAttribute("aria-invalid", "true");
	expect(screen.getByText("Enter a valid email address.")).toBeDefined();
	expect(screen.getByText("Enter your message.")).toBeDefined();
	expect(message.nextElementSibling).toBe(
		screen.getByText("Enter your message.").closest('[data-slot="form-message"]'),
	);
	expect(message.nextElementSibling?.nextElementSibling).toHaveTextContent(
		"Do not include passwords, card details or national ID numbers.",
	);
	expect(submit).not.toHaveBeenCalled();
	fireEvent.change(email, { target: { value: "reader@example.test" } });
	fireEvent.click(screen.getByRole("button", { name: "Send message" }));
	expect(message).toHaveFocus();
	expect(email).toHaveAttribute("aria-invalid", "false");
});
it("rejects malformed email and whitespace-only messages", () => {
	show();
	fill();
	fireEvent.change(screen.getByLabelText("Your email"), { target: { value: "invalid" } });
	fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "   " } });
	fireEvent.click(screen.getByRole("button", { name: "Send message" }));
	expect(screen.getByLabelText("Your email")).toHaveFocus();
	expect(screen.getByText("Enter your message.")).toBeDefined();
	expect(submit).not.toHaveBeenCalled();
});
it("shows the message character budget as content changes", () => {
	show();
	expect(screen.getByText("characters")).toHaveTextContent("0 / 10000 characters");
	fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "Hello" } });
	expect(screen.getByText("characters")).toHaveTextContent("5 / 10000 characters");
});

it("localizes inline errors and the character count in Arabic", () => {
	show("ar-SA");
	fireEvent.click(screen.getByRole("button", { name: "إرسال الرسالة" }));
	expect(screen.getByText("أدخل بريدًا إلكترونيًا صالحًا.")).toBeDefined();
	expect(screen.getByText("اكتب رسالتك.")).toBeDefined();
	expect(screen.getByText("حرف")).toHaveTextContent("0 / 10000 حرف");
	expect(screen.getByLabelText("بريدك")).toHaveFocus();
	expect(submit).not.toHaveBeenCalled();
});
it("rejects content above the server message limit", () => {
	show();
	fill();
	fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "a".repeat(10001) } });
	fireEvent.click(screen.getByRole("button", { name: "Send message" }));
	expect(screen.getByText("Keep your message within 10000 characters.")).toBeDefined();
	expect(screen.getByLabelText("Your message")).toHaveFocus();
	expect(submit).not.toHaveBeenCalled();
});

it("groups the topics visibly and exposes approved data-rights guidance", () => {
	show();
	expect(screen.getByRole("group", { name: "Subject" })).toBeDefined();
	expect(screen.getByRole("link", { name: "FAQ" })).toHaveAttribute("href", "#help-faq");
	expect(screen.getByText("Your rights")).toBeDefined();
	expect(
		screen.getByText(
			"Download a copy of your data, correct it or delete your account in Settings, then Privacy and data.",
		),
	).toBeDefined();
});

it("uses the verified account address without an email field or client email", async () => {
	context.session = { user: { email: "demo@master-cv.test", emailVerified: true } };
	submit.mockResolvedValue({ id: "receipt", status: "received" });
	show();
	expect(screen.queryByLabelText("Your email")).toBeNull();
	expect(screen.getByText("demo@master-cv.test")).toHaveAttribute("dir", "auto");
	fireEvent.click(screen.getByRole("button", { name: "Send message" }));
	expect(screen.getByLabelText("Your message")).toHaveFocus();
	expect(submit).not.toHaveBeenCalled();
	fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "Account support question" } });
	fireEvent.click(screen.getByRole("button", { name: "Send message" }));
	expect(await screen.findByText("Message received")).toBeDefined();
	expect(submit).toHaveBeenCalledWith({
		subject: "export",
		message: "Account support question",
		locale: "en-US",
		requestNonce: expect.any(String),
	});
});
