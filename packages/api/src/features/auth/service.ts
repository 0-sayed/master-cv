import type { AuthProvider } from "@reactive-resume/auth/types";
import { ORPCError } from "@orpc/client";
import { eq } from "drizzle-orm";
import { db } from "@reactive-resume/db/client";
import * as schema from "@reactive-resume/db/schema";
import { env } from "@reactive-resume/env/server";

type ProviderList = Partial<Record<AuthProvider, string>>;

const providers = {
	list: (): ProviderList => {
		return {
			credential: "Password",
			passkey: "Passkey",
			...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { google: "Google" } : {}),
		};
	},
};

export const authService = {
	providers,
	getProfile: async (userId: string) => {
		const [user] = await db
			.select({
				id: schema.user.id,
				name: schema.user.name,
				username: schema.user.username,
				displayUsername: schema.user.displayUsername,
				image: schema.user.image,
				email: schema.user.email,
				emailVerified: schema.user.emailVerified,
				timezone: schema.user.timezone,
			})
			.from(schema.user)
			.where(eq(schema.user.id, userId));
		if (!user) throw new ORPCError("NOT_FOUND");
		return user;
	},

	/** Privacy actions require browser-bound proof and durable work; no internal bypass. */
	exportData: (_input: { userId: string }): Promise<never> => {
		return Promise.reject(new ORPCError("FORBIDDEN", { message: "Use the proved account export request." }));
	},
	deleteAccount: (_input: { userId: string }): Promise<never> => {
		return Promise.reject(new ORPCError("FORBIDDEN", { message: "Use the proved account deletion request." }));
	},
};
