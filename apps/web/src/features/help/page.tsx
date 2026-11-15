import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button, buttonVariants } from "@reactive-resume/ui/components/button";
import { FormControl, FormDescription, FormItem, FormLabel, FormMessage } from "@reactive-resume/ui/components/form";
import { Input } from "@reactive-resume/ui/components/input";
import { Label } from "@reactive-resume/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@reactive-resume/ui/components/radio-group";
import { Textarea } from "@reactive-resume/ui/components/textarea";
import { PrivacyNotice } from "../settings/privacy/notice";
import { SettingsSection } from "../settings/section";
import { client } from "@/libs/orpc/client";
export function HelpPage() {
	const { i18n } = useLingui();
	const { session } = useRouteContext({ from: "__root__" });
	const accountEmail = session?.user.emailVerified ? session.user.email : undefined;
	const emailRef = useRef<HTMLInputElement>(null);
	const messageRef = useRef<HTMLTextAreaElement>(null);
	const receiptRef = useRef<HTMLDivElement>(null);
	const [submitted, setSubmitted] = useState(false);
	const [email, setEmail] = useState("");
	const [message, setMessage] = useState("");
	const [subject, setSubject] = useState<"export" | "plan" | "privacy" | "other">("export");
	const [nonce, setNonce] = useState(() => crypto.randomUUID());
	const emailError =
		!accountEmail && !z.email().max(254).safeParse(email).success
			? t({ message: "Enter a valid email address.", context: "help.contact.emailError" })
			: undefined;
	const messageError = !message.trim()
		? t({ message: "Enter your message.", context: "help.contact.messageRequired" })
		: message.trim().length > 10000
			? t({ message: "Keep your message within 10000 characters.", context: "help.contact.messageTooLong" })
			: undefined;
	const count = String(message.length);
	const limit = "10000";
	const send = useMutation({
		mutationFn: () =>
			client.privacy.support({
				...(accountEmail ? {} : { email }),
				subject,
				message,
				requestNonce: nonce,
				locale: i18n.locale === "en-US" ? "en-US" : "ar-SA",
			}),
	});
	useEffect(() => {
		if (send.isSuccess) receiptRef.current?.focus();
	}, [send.isSuccess]);
	return (
		<>
			<div className="grid gap-8 md:grid-cols-2">
				<SettingsSection
					title={<Trans context="help.contact.title">Send us a message</Trans>}
					action={
						<a
							href="#help-faq"
							className={buttonVariants({ variant: "link", size: "link-touch", className: "md:hidden" })}
						>
							<Trans context="help.navigation.faq">FAQ</Trans>
						</a>
					}
				>
					{send.isSuccess ? (
						<div ref={receiptRef} role="status" tabIndex={-1}>
							<PrivacyNotice
								title={<Trans context="help.contact.receivedTitle">Message received</Trans>}
								action={
									<Button
										variant="secondary"
										onClick={() => {
											send.reset();
											setMessage("");
											setSubmitted(false);
											setNonce(crypto.randomUUID());
											requestAnimationFrame(() => messageRef.current?.focus());
										}}
									>
										<Trans context="help.contact.sendAnother">Send another message</Trans>
									</Button>
								}
							>
								<Trans context="workspace.privacy.d83e78513a68">
									Your message was received and saved. This receipt does not mean the request is resolved.
								</Trans>
							</PrivacyNotice>
						</div>
					) : (
						<form
							noValidate
							className="grid gap-4"
							onSubmit={(e) => {
								e.preventDefault();
								setSubmitted(true);
								if (emailError || messageError) {
									(emailError ? emailRef.current : messageRef.current)?.focus();
									return;
								}
								if (!send.isPending) send.mutate();
							}}
						>
							{send.isError && (
								<PrivacyNotice
									error
									title={<Trans context="workspace.privacy.20dd5d297a1c">Message could not be received</Trans>}
								>
									<Trans context="workspace.privacy.747ab99219d3">
										Your message is still here. Check your connection and send it again.
									</Trans>
								</PrivacyNotice>
							)}
							{accountEmail ? (
								<p className="type-body text-ink-2">
									<Trans>
										We will reply to <bdi dir="auto">{accountEmail}</bdi>
									</Trans>
								</p>
							) : (
								<FormItem hasError={submitted && Boolean(emailError)}>
									<FormLabel>
										<Trans context="help.contact.emailLabel">Your email</Trans>
									</FormLabel>
									<FormControl
										render={
											<Input
												ref={emailRef}
												type="email"
												dir="ltr"
												autoComplete="email"
												maxLength={254}
												required
												value={email}
												onChange={(e) => setEmail(e.target.value)}
											/>
										}
									/>
									{submitted && <FormMessage errors={[emailError]} />}
								</FormItem>
							)}
							<fieldset className="grid min-w-0 gap-2">
								<legend className="mb-2 type-label">
									<Trans context="help.contact.subject.label">Subject</Trans>
								</legend>
								<RadioGroup
									value={subject}
									className="sm:grid-cols-2"
									onValueChange={(value) => {
										if (value === "export" || value === "plan" || value === "privacy" || value === "other")
											setSubject(value);
									}}
									aria-label={t({ message: "Subject", context: "help.contact.subject.label" })}
								>
									<Label>
										<RadioGroupItem value="export" />
										<Trans context="help.contact.subject.export">Export problem</Trans>
									</Label>
									<Label>
										<RadioGroupItem value="plan" />
										<Trans context="help.contact.subject.plan">Plan question</Trans>
									</Label>
									<Label>
										<RadioGroupItem value="privacy" />
										<Trans context="privacy.navigation.data">Privacy & data</Trans>
									</Label>
									<Label>
										<RadioGroupItem value="other" />
										<Trans context="help.contact.subject.other">Other</Trans>
									</Label>
								</RadioGroup>
							</fieldset>
							<FormItem hasError={submitted && Boolean(messageError)}>
								<FormLabel>
									<Trans context="help.contact.messageLabel">Your message</Trans>
								</FormLabel>
								<FormControl
									render={
										<Textarea
											ref={messageRef}
											size="message"
											dir="auto"
											required
											maxLength={10000}
											value={message}
											onChange={(e) => setMessage(e.target.value)}
										/>
									}
								/>
								{submitted && <FormMessage errors={[messageError]} />}
								<FormDescription>
									<Trans context="help.contact.sensitiveDataHint">
										Do not include passwords, card details or national ID numbers.
									</Trans>
								</FormDescription>
								<p className="type-metadata text-ink-2" dir="auto">
									<Trans context="help.contact.characterCount">
										<bdi dir="ltr">
											{count} / {limit}
										</bdi>{" "}
										characters
									</Trans>
								</p>
							</FormItem>
							<Button type="submit" loading={send.isPending}>
								<Trans context="help.contact.submit">Send message</Trans>
							</Button>
						</form>
					)}
				</SettingsSection>
				<SettingsSection
					id="help-faq"
					presentation="column"
					title={<Trans context="help.faq.title">Frequently asked questions</Trans>}
				>
					<div className="grid gap-6">
						<div className="grid gap-1.5">
							<h3 className="type-label">
								<Trans context="help.faq.export.question">How do I export my CV?</Trans>
							</h3>
							<p>
								<Trans context="help.faq.export.answer">In the editor, choose Export, then PDF.</Trans>
							</p>
						</div>
						<div className="grid gap-1.5">
							<h3 className="type-label">
								<Trans context="help.faq.uiLanguage.question">
									Does changing the interface language translate my CV?
								</Trans>
							</h3>
							<p>
								<Trans context="help.faq.uiLanguage.answer">
									No. Interface language does not change your CV content.
								</Trans>
							</p>
						</div>
						<div className="grid gap-1.5">
							<h3 className="type-label">
								<Trans context="help.faq.deletion.question">How do I delete my account?</Trans>
							</h3>
							<p>
								<Trans context="help.faq.deletion.answer">Go to Settings, then Privacy and data.</Trans>
							</p>
						</div>
						<div className="grid gap-1.5">
							<h3 className="type-label">
								<Trans context="privacy.policy.rightsTitle">Your rights</Trans>
							</h3>
							<p>
								<Trans context="privacy.policy.rightsDescription">
									Download a copy of your data, correct it or delete your account in Settings, then Privacy and data.
								</Trans>
							</p>
							<p>
								<Trans context="workspace.privacy.e8452f34432b">
									Support cannot reset access, export or delete an account based on an unverified email or message
									claim.
								</Trans>
							</p>
						</div>
					</div>
				</SettingsSection>
			</div>
		</>
	);
}
