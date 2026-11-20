import { assertProductionDemoAccount, productionDemoUsername } from "./demo-production-account";
import { assertProductionDemoEnvironment } from "./demo-production-safety";

/** No environment files, public fixture credentials, provider calls, or global reset. */
export async function seedProductionDemoWorkspace(environment: NodeJS.ProcessEnv = process.env) {
	const configuration = assertProductionDemoEnvironment(environment);
	const { db, getPool, withOwnerTransaction } = await import("@reactive-resume/db/client");
	const { assertRuntimeDatabaseRole } = await import("@reactive-resume/db/owner-scope");
	await assertRuntimeDatabaseRole(getPool());
	const { auth, initializeAuth } = await import("@reactive-resume/auth/config");
	await initializeAuth();
	const { and, eq, is, sql, getTableColumns } = await import("drizzle-orm");
	const { PgTable } = await import("drizzle-orm/pg-core");
	const tables = await import("@reactive-resume/db/schema");
	const { randomUUID } = await import("node:crypto");
	const { demoAccountName } = await import("./demo-fixture");
	const { populateDemoWorkspace, createOwnerDemoJobCopyAdmission, inspectDemoState } = await import("./demo-seed.ts");
	const effects: import("./demo-seed.ts").DemoSeedEffects = { commit: [], rollback: [] };
	let committed = false;
	try {
		const result = await db.transaction(async (tx) => {
			// Serialize absent-account creation too. All seed queries below bind one explicit owner.
			await tx.execute(
				sql`SELECT pg_advisory_xact_lock(hashtextextended(${`production-demo:${configuration.email}`}, 0))`,
			);
			const [existing] = await tx
				.select()
				.from(tables.user)
				.where(sql`lower(${tables.user.email}) = ${configuration.email}`)
				.for("update");
			const id = existing?.id ?? randomUUID();
			return withOwnerTransaction(id, tx, async () => {
				let hasData = false;
				if (existing) {
					// Fail closed for any private row, including future owner tables and security credentials.
					for (const table of Object.values(tables)) {
						if (!is(table, PgTable) || table === tables.account || table === tables.session) continue;
						const columns: Record<string, import("drizzle-orm/pg-core").PgColumn> = getTableColumns(table);
						const owner = columns.userId ?? (table === tables.apikey ? columns.referenceId : undefined);
						if (!owner) continue;
						const rows = await tx.select({ owner }).from(table).where(eq(owner, id)).limit(1);
						if (rows.length) hasData = true;
					}
				}
				const marked = existing ? assertProductionDemoAccount(existing, configuration.email, hasData) : false;
				const accounts = await tx.select().from(tables.account).where(eq(tables.account.userId, id));
				const credential = accounts[0];
				if (
					accounts.length > 1 ||
					(credential && (credential.providerId !== "credential" || credential.accountId !== id))
				)
					throw new Error("DEMO_CREDENTIAL_IDENTITY_COLLISION");
				const context = await auth.$context;
				const samePassword =
					credential?.password &&
					(await context.password.verify({ password: configuration.password, hash: credential.password }));
				const username = productionDemoUsername(configuration.email);
				const identity = {
					name: demoAccountName,
					emailVerified: true,
					username,
					displayUsername: username,
					uiLocale: "ar-SA" as const,
					timezone: "Asia/Riyadh",
				};
				const [user] = existing
					? marked && existing.emailVerified
						? [existing]
						: await tx
								.update(tables.user)
								.set(marked ? { emailVerified: true } : identity)
								.where(eq(tables.user.id, id))
								.returning()
					: await tx
							.insert(tables.user)
							.values({ ...identity, id, email: configuration.email, role: "user" })
							.returning();
				if (!user) throw new Error("DEMO_ACCOUNT_READBACK_FAILED");
				if (!samePassword) {
					const password = await context.password.hash(configuration.password);
					if (credential)
						await tx
							.update(tables.account)
							.set({ password })
							.where(and(eq(tables.account.id, credential.id), eq(tables.account.userId, id)));
					else
						await tx.insert(tables.account).values({ userId: id, accountId: id, providerId: "credential", password });
					await tx.delete(tables.session).where(eq(tables.session.userId, id));
				}
				// A completed marker preserves edits on reruns; partial marked fixtures can be rebuilt.
				const resumes = await tx
					.select({ tags: tables.resume.tags })
					.from(tables.resume)
					.where(eq(tables.resume.userId, id));
				let reset = false;
				try {
					inspectDemoState(resumes, [Number(hasData)]);
				} catch (error) {
					if (
						!marked ||
						!(error instanceof Error) ||
						!["DEMO_PARTIAL_CONTENT", "DEMO_VERSION_REQUIRES_RESET"].includes(error.message)
					)
						throw error;
					reset = true;
				}
				return populateDemoWorkspace(user, configuration.appUrl, await createOwnerDemoJobCopyAdmission(id), {
					reset,
					effects,
				});
			});
		});
		committed = true;
		for (const effect of effects.commit) await effect();
		return result;
	} catch (error) {
		if (!committed) for (const effect of effects.rollback) await effect();
		throw error;
	}
}
