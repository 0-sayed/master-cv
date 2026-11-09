import * as pg from "drizzle-orm/pg-core";
import { user } from "./auth";
import { ownerPolicy } from "./ownership";

/** One selected web connection per user. */
export const webAccessCredential = pg.pgTable.withRLS(
	"web_access_credentials",
	{
		userId: pg
			.text("user_id")
			.primaryKey()
			.references(() => user.id, { onDelete: "cascade" }),
		provider: pg.text("provider", { enum: ["firecrawl", "tavily", "exa"] }).notNull(),
		encryptedApiKey: pg.text("encrypted_api_key").notNull(),
	},
	(t) => [ownerPolicy(t.userId)],
);
