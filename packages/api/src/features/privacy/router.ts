import type { ProofCredential } from "@reactive-resume/auth/account-access";
import { ORPCError } from "@orpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { beginFreshProof, verifyFreshProof, requireAccountSession } from "@reactive-resume/auth/account-access";
import {
	getAccountSecurityState,
	requestEmailChange,
	cancelEmailChange,
	revokeAccountSessions,
	resendEmailChange,
} from "@reactive-resume/auth/account-changes";
import { withOwnerDatabase } from "@reactive-resume/db/owner-scope";
import { accountDataExport } from "@reactive-resume/db/schema";
import { protectedProcedure, publicProcedure } from "../../context";
import { freshProofSchema, accountActionSchema, exportRequestSchema } from "./contracts";
import { requestAccountDeletion } from "./deletion";
import { getAccountExport } from "./delivery";
import { requestAccountExport } from "./export";
import { supportInputSchema, submitSupportRequest } from "./support";

const sessionProcedure = protectedProcedure.use(async ({ context, next }) => {
	if (context.authentication?.method !== "session") throw new ORPCError("FORBIDDEN");
	try {
		await requireAccountSession(context.reqHeaders);
	} catch {
		throw new ORPCError("UNAUTHORIZED");
	}
	return next();
});
const credentialShape = z.discriminatedUnion("method", [
	z.object({
		method: z.literal("password"),
		password: z.string().min(1).max(1024),
		mfaCode: z
			.string()
			.regex(/^\d{6}$/)
			.optional(),
	}),
	z.object({
		method: z.literal("passkey"),
		response: z.object({
			id: z.string().max(2048),
			rawId: z.string().max(2048),
			type: z.literal("public-key"),
			clientExtensionResults: z.record(z.string(), z.unknown()),
			response: z.object({
				clientDataJSON: z.string().max(8192),
				authenticatorData: z.string().max(8192),
				signature: z.string().max(8192),
				userHandle: z.string().optional(),
			}),
		}),
	}),
]);
const safeProcedure = sessionProcedure.use(async ({ next }) => {
	try {
		return await next();
	} catch (error) {
		if (error instanceof ORPCError) throw error;
		const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "ACCOUNT_PROOF_FAILED";
		throw new ORPCError("BAD_REQUEST", { message: code });
	}
});
const securitySchema = z.object({
	credentials: z.object({
		hasPassword: z.boolean(),
		mfaEnabled: z.boolean(),
		passkeyCount: z.number().int().nonnegative(),
	}),
	sessions: z.array(
		z.object({
			id: z.string(),
			current: z.boolean(),
			createdAt: z.iso.datetime(),
			lastActiveAt: z.iso.datetime().nullable(),
			expiresAt: z.iso.datetime(),
			deviceLabel: z.string().nullable(),
		}),
	),
	pendingEmail: z
		.object({
			address: z.email(),
			stage: z.enum(["confirm_old", "verify_new"]),
			confirmationAddress: z.email(),
			requestedAt: z.iso.datetime(),
			expiresAt: z.iso.datetime(),
		})
		.nullable(),
});
export const privacyRouter = {
	latestExport: safeProcedure
		.route({ method: "POST", path: "/privacy/export/latest", tags: ["Privacy"] })
		.input(z.object({}).optional())
		.output(exportRequestSchema.nullable())
		.handler(async ({ context }) => {
			const [row] = await withOwnerDatabase(context.user.id, (tx) =>
				tx
					.select({ id: accountDataExport.id })
					.from(accountDataExport)
					.where(eq(accountDataExport.userId, context.user.id))
					.orderBy(desc(accountDataExport.requestedAt))
					.limit(1),
			);
			return row ? await getAccountExport({ id: row.id, headers: context.reqHeaders }) : null;
		}),
	support: publicProcedure
		.route({ method: "POST", path: "/privacy/support", tags: ["Privacy"] })
		.input(supportInputSchema.extend({ email: z.string().optional() }))
		.output(z.object({ id: z.string(), status: z.literal("received") }))
		.handler(async ({ context, input }) => {
			const origin = context.reqHeaders.get("origin");
			if (
				origin &&
				new URL(origin).origin !== new URL((await import("@reactive-resume/env/server")).env.APP_URL).origin
			)
				throw new ORPCError("FORBIDDEN");
			if (context.user && !context.user.emailVerified) throw new ORPCError("FORBIDDEN");
			const data = supportInputSchema.safeParse({
				...input,
				email: context.user ? context.user.email : input.email,
			});
			if (!data.success) throw new ORPCError("BAD_REQUEST");
			return submitSupportRequest({
				...data.data,
				...(context.user ? { authentication: { userId: context.user.id } } : {}),
			});
		}),
	requestExport: safeProcedure
		.route({ method: "POST", path: "/privacy/export", tags: ["Privacy"] })
		.input(z.object({ proofToken: z.string().min(32), requestNonce: z.string().min(1).max(128) }))
		.output(exportRequestSchema)
		.handler(({ context, input }) => requestAccountExport({ ...input, headers: context.reqHeaders })),
	exportStatus: safeProcedure
		.route({ method: "POST", path: "/privacy/export/status", tags: ["Privacy"] })
		.input(z.object({ id: z.string().max(255) }))
		.output(exportRequestSchema)
		.handler(({ context, input }) => getAccountExport({ ...input, headers: context.reqHeaders })),
	requestDeletion: safeProcedure
		.route({ method: "POST", path: "/privacy/deletion", tags: ["Privacy"] })
		.input(
			z.object({
				proofToken: z.string().min(32),
				requestNonce: z.string().min(1).max(128),
				confirmed: z.literal(true),
			}),
		)
		.output(z.object({ requestId: z.string(), status: z.literal("requested") }))
		.handler(({ context, input }) => requestAccountDeletion({ ...input, headers: context.reqHeaders })),
	resendEmailChange: safeProcedure
		.route({ method: "POST", path: "/privacy/email/resend", tags: ["Privacy"] })
		.input(z.object({}).optional())
		.output(z.object({ status: z.literal("pending") }))
		.handler(({ context }) => resendEmailChange(context.reqHeaders)),
	revokeSessions: safeProcedure
		.route({ method: "POST", path: "/privacy/sessions/revoke", tags: ["Privacy"] })
		.input(z.object({ id: z.string().max(255).optional(), others: z.boolean().optional() }))
		.output(z.void())
		.handler(({ context, input }) => revokeAccountSessions({ ...input, headers: context.reqHeaders })),
	security: safeProcedure
		.route({ method: "POST", path: "/privacy/security", tags: ["Privacy"] })
		.input(z.object({}).optional())
		.output(securitySchema)
		.handler(({ context }) => getAccountSecurityState(context.reqHeaders)),
	requestEmailChange: safeProcedure
		.route({ method: "POST", path: "/privacy/email/request", tags: ["Privacy"] })
		.input(
			z.object({
				newEmail: z.email().max(254),
				requestNonce: z.string().min(1).max(128),
				credential: z.union([
					z.object({
						method: z.literal("password"),
						password: z.string().min(1).max(1024),
						mfaCode: z
							.string()
							.regex(/^\d{6}$/)
							.optional(),
					}),
					z.object({ method: z.literal("proof"), token: z.string().min(32) }),
				]),
			}),
		)
		.output(z.object({ status: z.literal("pending") }))
		.handler(({ context, input }) => requestEmailChange({ ...input, headers: context.reqHeaders })),
	cancelEmailChange: safeProcedure
		.route({ method: "POST", path: "/privacy/email/cancel", tags: ["Privacy"] })
		.input(z.object({}).optional())
		.output(z.void())
		.handler(({ context }) => cancelEmailChange(context.reqHeaders)),
	beginProof: safeProcedure
		.route({ method: "POST", path: "/privacy/proof/begin", tags: ["Privacy"] })
		.input(z.object({ action: accountActionSchema, requestNonce: z.string().min(1).max(128) }))
		.output(
			z.object({
				challengeId: z.string(),
				expiresAt: z.iso.datetime(),
				methods: z.array(z.enum(["password", "passkey"])),
				passkeyOptions: z
					.object({
						challenge: z.string(),
						rpId: z.string().optional(),
						timeout: z.number().optional(),
						userVerification: z.enum(["required", "preferred", "discouraged"]).optional(),
					})
					.optional(),
			}),
		)
		.handler(({ context, input }) => beginFreshProof({ ...input, headers: context.reqHeaders })),
	verifyProof: safeProcedure
		.route({ method: "POST", path: "/privacy/proof/verify", tags: ["Privacy"] })
		.input(
			z.object({
				challengeId: z.string().uuid(),
				credential: credentialShape.transform((value): ProofCredential => {
					if (value.method === "password")
						return {
							method: value.method,
							password: value.password,
							...(value.mfaCode ? { mfaCode: value.mfaCode } : {}),
						};
					const { userHandle, ...response } = value.response.response;
					return {
						method: value.method,
						response: { ...value.response, response: { ...response, ...(userHandle ? { userHandle } : {}) } },
					};
				}),
			}),
		)
		.output(freshProofSchema)
		.handler(({ context, input }) => verifyFreshProof({ ...input, headers: context.reqHeaders })),
};
