import type { DialogProps } from "../store";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useSelector } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import z from "zod";
import { Button } from "@reactive-resume/ui/components/button";
import { Checkbox } from "@reactive-resume/ui/components/checkbox";
import { FormControl, FormItem, FormLabel, FormMessage } from "@reactive-resume/ui/components/form";
import { Icon } from "@reactive-resume/ui/components/icon";
import {
	TaskOverlayContent,
	TaskOverlayDescription,
	TaskOverlayFooter,
	TaskOverlayHeader,
	TaskOverlayTitle,
} from "@reactive-resume/ui/components/task-overlay";
import { toast } from "@reactive-resume/ui/components/toast";
import { useDialogStore } from "../store";
import { PasswordInput } from "@/components/input/password-input";
import { AccountFormError } from "@/features/auth/components/account-form-error";
import { accountSecurityQueryOptions } from "@/features/settings/account/auth-hooks";
import { useFormBlocker } from "@/hooks/use-form-blocker";
import { authClient } from "@/libs/auth/client";
import { useAppForm } from "@/libs/tanstack-form";

export function ChangePasswordDialog(_: DialogProps<"auth.change-password">) {
	useLingui();
	const formSchema = z
		.object({
			currentPassword: z.string().min(6).max(64),
			newPassword: z.string().min(8).max(64),
			revokeOtherSessions: z.boolean(),
		})
		.refine((data) => data.newPassword !== data.currentPassword, {
			message: t`New password cannot be the same as the current password.`,
			path: ["newPassword"],
		});
	const queryClient = useQueryClient();
	const closeDialog = useDialogStore((state) => state.closeDialog);
	const [failure, setFailure] = useState<unknown>(null);

	const form = useAppForm({
		defaultValues: {
			currentPassword: "",
			newPassword: "",
			revokeOtherSessions: false,
		},
		validators: {
			onSubmit: formSchema,
		},
		onSubmit: async ({ value }) => {
			setFailure(null);
			try {
				const { error } = await authClient.changePassword({
					currentPassword: value.currentPassword,
					newPassword: value.newPassword,
					revokeOtherSessions: value.revokeOtherSessions,
				});
				if (error) {
					setFailure(error);
					return;
				}
			} catch (error) {
				setFailure(error);
				return;
			}
			toast.add({ type: "success", description: t`Your password has been updated.` });
			void queryClient.invalidateQueries({ queryKey: ["auth", "accounts"] });
			void queryClient.invalidateQueries({ queryKey: accountSecurityQueryOptions().queryKey });
			closeDialog();
		},
	});

	const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);

	const { requestClose } = useFormBlocker(form);

	return (
		<TaskOverlayContent closeLabel={t`Close`}>
			<TaskOverlayHeader>
				<TaskOverlayTitle className="flex items-center gap-x-2">
					<Icon name="password" size={16} />
					<Trans>Update your password</Trans>
				</TaskOverlayTitle>
				<TaskOverlayDescription>
					<Trans>Enter your current password and a new password to update your account.</Trans>
				</TaskOverlayDescription>
			</TaskOverlayHeader>

			<form
				className="space-y-4"
				onSubmit={(event) => {
					event.preventDefault();
					event.stopPropagation();
					void form.handleSubmit();
				}}
			>
				<form.Field name="currentPassword">
					{(field) => (
						<FormItem hasError={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
							<FormLabel>
								<Trans>Current Password</Trans>
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

				<form.Field name="newPassword">
					{(field) => (
						<FormItem hasError={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
							<FormLabel>
								<Trans>New Password</Trans>
							</FormLabel>
							<FormControl
								render={
									<PasswordInput
										minLength={8}
										maxLength={64}
										autoComplete="new-password"
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

				<form.Field name="revokeOtherSessions">
					{(field) => (
						<FormItem orientation="horizontal">
							<FormControl
								render={<Checkbox name={field.name} checked={field.state.value} onCheckedChange={field.handleChange} />}
							/>
							<FormLabel>
								<Trans>Sign out from all other devices</Trans>
							</FormLabel>
						</FormItem>
					)}
				</form.Field>

				<AccountFormError error={failure} pending={isSubmitting} onRetry={() => void form.handleSubmit()} />

				<TaskOverlayFooter>
					<Button type="button" variant="secondary" disabled={isSubmitting} onClick={requestClose}>
						<Trans context="workspace.privacy.19766ed6ccb2">Cancel</Trans>
					</Button>
					<Button type="submit" disabled={isSubmitting}>
						<Trans comment="Primary action button to submit changed password">Update Password</Trans>
					</Button>
				</TaskOverlayFooter>
			</form>
		</TaskOverlayContent>
	);
}
