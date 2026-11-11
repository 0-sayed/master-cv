import { beforeAll, describe, expect, it } from "vite-plus/test";
import { aiTestDatabase } from "../ai/testing/database";
import { recordEditDecision } from "./decisions";

describe.skipIf(!process.env.COVER_LETTER_TEST_DATABASE_URL)("confirmed assistant decisions", () => {
	const database = aiTestDatabase();
	beforeAll(async () => {
		await database
			.admin()
			.query("INSERT INTO agent_threads(id,user_id,title,edits_proposed) VALUES ('thread','alice','Synthetic',1)");
		await database
			.admin()
			.query(
				"INSERT INTO agent_messages(id,user_id,thread_id,role,sequence,ui_message) VALUES ('row','alice','thread','assistant',1,$1)",
				[
					JSON.stringify({
						id: "message",
						role: "assistant",
						parts: [
							{
								type: "tool-propose_edits",
								toolCallId: "tool",
								state: "output-available",
								output: { edits: [{ id: "edit", status: "pending" }] },
							},
						],
					}),
				],
			);
	});
	const input = {
		userId: "alice",
		threadId: "thread",
		messageId: "message",
		toolCallId: "tool",
		edits: [{ id: "edit", status: "accepted" as const, expectedStatus: "pending" as const }],
	};
	it("acknowledges exact stored decisions idempotently and rejects stale, forged and foreign changes", async () => {
		expect(await database.run(() => recordEditDecision(input))).toMatchObject({ editsAccepted: 1 });
		expect(await database.run(() => recordEditDecision(input))).toMatchObject({ editsAccepted: 1 });
		await expect(
			database.run(() =>
				recordEditDecision({ ...input, edits: [{ id: "edit", status: "rejected", expectedStatus: "pending" }] }),
			),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await expect(database.run(() => recordEditDecision({ ...input, toolCallId: "forged" }))).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		await expect(database.run(() => recordEditDecision({ ...input, userId: "bob" }))).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect(
			await database.run(() =>
				recordEditDecision({ ...input, edits: [{ id: "edit", status: "pending", expectedStatus: "accepted" }] }),
			),
		).toMatchObject({ editsAccepted: 0 });
	});
});
