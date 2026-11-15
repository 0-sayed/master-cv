import type { DialogProps } from "../store";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useSelector } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import z from "zod";
import { Button } from "@reactive-resume/ui/components/button";
import {
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@reactive-resume/ui/components/dialog";
import { FormControl, FormItem, FormLabel, FormMessage } from "@reactive-resume/ui/components/form";
import { Icon } from "@reactive-resume/ui/components/icon";
import { toast } from "@reactive-resume/ui/components/toast";
import { useDialogStore } from "../store";
import { PasswordInput } from "@/components/input/password-input";
import { AccountFormError } from "@/features/auth/components/account-form-error";
import { accountSecurityQueryOptions } from "@/features/settings/account/auth-hooks";
import { useFormBlocker } from "@/hooks/use-form-blocker";
import { authClient } from "@/libs/auth/client";
import { sessionQueryKey } from "@/libs/root-context";
import { useAppForm } from "@/libs/tanstack-form";

const formSchema = z.object({
	password: z.string().min(6).max(64),
});

export function DisableTwoFactorDialog(_: DialogProps<"auth.two-factor.disable">) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const closeDialog = useDialogStore((state) => state.closeDialog);
	const [failure, setFailure] = useState<unknown>(null);

	const form = useAppForm({
		defaultValues: { password: "" },
		validators: { onSubmit: formSchema },
		onSubmit: async ({ value }) => {
			setFailure(null);
			try {
				const { error } = await authClient.twoFactor.disable({ password: value.password });
				if (error) {
					setFailure(error);
					return;
				}
			} catch (error) {
				setFailure(error);
				return;
			}
			toast.add({ type: "success", description: t`Two-factor authentication is now disabled.` });
			void queryClient.invalidateQueries({ queryKey: accountSecurityQueryOptions().queryKey });
			void queryClient.invalidateQueries({ queryKey: sessionQueryKey }).then(() => router.invalidate());
			closeDialog();
			form.reset();
		},
	});

	const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);

	const { requestClose } = useFormBlocker(form);

	return (
		<DialogContent>
			<DialogHeader>
				<DialogTitle className="flex items-center gap-x-2">
					<Icon name="lock-open" size={16} />
					<Trans>Disable Two-Factor Authentication</Trans>
				</DialogTitle>
				<DialogDescription>
					<Trans>
						Enter your password to disable two-factor authentication. Your account will be less secure without 2FA
						enabled.
					</Trans>
				</DialogDescription>
			</DialogHeader>

			<form
				className="space-y-4"
				onSubmit={(event) => {
					event.preventDefault();
					event.stopPropagation();
					void form.handleSubmit();
				}}
			>
				<form.Field name="password">
					{(field) => (
						<FormItem hasError={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
							<FormLabel>
								<Trans>Password</Trans>
							</FormLabel>
							<FormControl
								render={
									<PasswordInput
										minLength={6}
										maxLength={64}
										autoComplete="current-password"
										name={field.name}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
									/>
								}
							/>
							<FormMessage errors={field.state.meta.errors} />
						</FormItem>
					)}
				</form.Field>

				<AccountFormError error={failure} pending={isSubmitting} onRetry={() => void form.handleSubmit()} />

				<DialogFooter>
					<Button type="button" variant="secondary" disabled={isSubmitting} onClick={requestClose}>
						<Trans context="workspace.privacy.19766ed6ccb2">Cancel</Trans>
					</Button>
					<Button type="submit" variant="danger" disabled={isSubmitting}>
						<Trans comment="Destructive action button to turn off two-factor authentication">Disable 2FA</Trans>
					</Button>
				</DialogFooter>
			</form>
		</DialogContent>
	);
}
