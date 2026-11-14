import { expect, it } from "vite-plus/test";
import { withDatabaseOwner } from "@reactive-resume/db/client";
import { aiTestDatabase } from "../ai/testing/database";
import { resumeService } from "../resume/service";
import { getJobEvidence } from "./job-evidence";
import { getJobTargetRevision, saveJobTarget, selectResumeJob } from "./job-targets";

const database = aiTestDatabase();
const owned = <T>(owner: string, work: () => T) => database.run(() => withDatabaseOwner(owner, work));
it("persists exact append-only jobs with optimistic revisions and rejects foreign reads", async () => {
	const input = { role: "Engineer", employer: "", text: " \r\nReact و SAP  " };
	const first = await owned("alice", () => saveJobTarget("alice", input));
	expect((await owned("alice", () => getJobTargetRevision("alice", first.jobId, first.revision))).text).toBe(
		input.text,
	);
	await expect(owned("bob", () => getJobTargetRevision("bob", first.jobId, first.revision))).rejects.toMatchObject({
		code: "NOT_FOUND",
	});
	const race = await Promise.allSettled(
		["React", "SAP"].map((text) =>
			owned("alice", () =>
				saveJobTarget("alice", { ...input, jobId: first.jobId, expectedRevision: first.revision, text }),
			),
		),
	);
	expect(race.filter((result) => result.status === "fulfilled")).toHaveLength(1);
	expect(race.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
	expect((await owned("alice", () => getJobTargetRevision("alice", first.jobId, first.revision))).text).toBe(
		input.text,
	);
});

it("binds selection and literal evidence to exact saved sources without changing CV revisions", async () => {
	const id = await owned("alice", () =>
		resumeService.create({ userId: "alice", name: "CV", tags: [], locale: "en-US" }),
	);
	const cv = (await database.admin().query("SELECT updated_at FROM resume WHERE id=$1", [id])).rows[0];
	const job = await owned("alice", () =>
		saveJobTarget("alice", { role: "Engineer", employer: "", text: "React, SAP" }),
	);
	const input = {
		resumeId: id,
		expectedUpdatedAt: cv.updated_at.toISOString(),
		jobId: job.jobId,
		jobRevision: job.revision,
	};
	const first = await owned("alice", () => selectResumeJob("alice", input));
	expect(first.jobRevision).toBe(job.revision);
	expect((await owned("alice", () => getJobEvidence("alice", id))).literal).toMatchObject({
		denominator: 2,
		matchedCount: 0,
	});
	expect((await database.admin().query("SELECT updated_at FROM resume WHERE id=$1", [id])).rows[0].updated_at).toEqual(
		cv.updated_at,
	);
	await expect(owned("alice", () => selectResumeJob("alice", input))).rejects.toMatchObject({ code: "CONFLICT" });
	await expect(owned("bob", () => selectResumeJob("bob", input))).rejects.toMatchObject({ code: "NOT_FOUND" });
	await database.admin().query("UPDATE resume SET is_locked=true WHERE id=$1", [id]);
	await expect(
		owned("alice", () => selectResumeJob("alice", { ...input, expectedSelectionRevision: first.revision })),
	).rejects.toMatchObject({ code: "RESUME_LOCKED" });
});
