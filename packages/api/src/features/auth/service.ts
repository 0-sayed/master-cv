import type { AuthProvider } from "@reactive-resume/auth/types";
import { ORPCError } from "@orpc/client";
import { eq } from "drizzle-orm";
import { db } from "@reactive-resume/db/client";
import * as schema from "@reactive-resume/db/schema";

type ProviderList = Partial<Record<AuthProvider, string>>;

const providers = {
	list: (): ProviderList => {
		// Email-first launch. Retained OAuth implementations do not authorize advertising them.
		return { credential: "Password", passkey: "Passkey" };
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
