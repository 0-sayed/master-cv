import type { auth } from "@reactive-resume/auth/config";
import { apiKeyClient } from "@better-auth/api-key/client";
import { dashClient } from "@better-auth/infra/client";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import { passkeyClient } from "@better-auth/passkey/client";
import { anonymousClient, inferAdditionalFields, twoFactorClient, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { recordSessionRetryAfter } from "./session-retry";
import { authSearchSchema } from "@/features/auth/redirect";

export const authClient = createAuthClient({
	fetchOptions: {
		onError({ request, response }) {
			const requestUrl = new URL(String(request.url), "http://localhost");
			if (requestUrl.pathname.endsWith("/get-session") && response.status === 429)
				recordSessionRetryAfter(response.headers.get("x-retry-after"));
		},
	},
	plugins: [
		dashClient(),
		apiKeyClient(),
		passkeyClient(),
		usernameClient(),
		anonymousClient(),
		twoFactorClient({
			onTwoFactorRedirect() {
				// Redirect to 2FA verification page
				const { callbackURL, reauthenticate } = authSearchSchema.parse({
					reauthenticate: new URLSearchParams(window.location.search).get("reauthenticate") === "true",
					callbackURL: new URLSearchParams(window.location.search).get("callbackURL"),
				});
				const search = new URLSearchParams({
					...(callbackURL ? { callbackURL } : {}),
					...(reauthenticate ? { reauthenticate: "true" } : {}),
				}).toString();
				window.location.href = `/auth/verify-2fa${search ? `?${search}` : ""}`;
			},
		}),
		oauthProviderClient(),
		oauthProviderResourceClient(),
		inferAdditionalFields<typeof auth>(),
	],
});
