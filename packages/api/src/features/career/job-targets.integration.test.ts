import { expect, it } from "vite-plus/test";
import { withDatabaseOwner } from "@reactive-resume/db/client";
import { aiTestDatabase } from "../ai/testing/database";
import { resumeService } from "../resume/service";
import { createVariant } from "../resume/variants";
import { getJobEvidence } from "./job-evidence";
import * as jobTargets from "./job-targets";
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

it("lets an original CV and its job copy edit their pinned ads independently", async () => {
	const base = await owned("bob", () =>
		resumeService.create({ userId: "bob", name: "Independent jobs", tags: [], locale: "en-US" }),
	);
	const original = (await database.admin().query("SELECT updated_at FROM resume WHERE id=$1", [base])).rows[0];
	const job = await owned("bob", () => saveJobTarget("bob", { role: "Engineer", employer: "", text: "React SAP" }));
	const selected = await owned("bob", () =>
		selectResumeJob("bob", {
			resumeId: base,
			expectedUpdatedAt: original.updated_at.toISOString(),
			jobId: job.jobId,
			jobRevision: job.revision,
		}),
	);
	const copy = await owned("bob", () =>
		createVariant("bob", {
			sourceResumeId: base,
			expectedUpdatedAt: original.updated_at.toISOString(),
			requestKey: "independent-job-copy",
			variantKind: "job",
			jobId: job.jobId,
			jobRevision: job.revision,
		}),
	);
	const copyBefore = await owned("bob", () => getJobEvidence("bob", copy.resumeId));
	if (!copyBefore.selection) throw new Error("Missing copied job selection");
	const changed = await owned("bob", () =>
		jobTargets.saveAndSelectResumeJob("bob", {
			resumeId: base,
			expectedUpdatedAt: original.updated_at.toISOString(),
			expectedSelectionRevision: selected.revision,
			role: "Engineer",
			employer: "",
			text: "Original ad changed",
		}),
	);
	expect((await owned("bob", () => getJobEvidence("bob", copy.resumeId))).job?.text).toBe("React SAP");
	await owned("bob", () =>
		jobTargets.saveAndSelectResumeJob("bob", {
			resumeId: copy.resumeId,
			expectedUpdatedAt: copy.updatedAt,
			expectedSelectionRevision: copyBefore.selection.revision,
			role: "Copy engineer",
			employer: "",
			text: "Independent copy ad",
		}),
	);
	expect((await owned("bob", () => getJobEvidence("bob", base))).job?.text).toBe("Original ad changed");
	expect((await owned("bob", () => getJobEvidence("bob", copy.resumeId))).job?.text).toBe("Independent copy ad");
	await owned("bob", () =>
		jobTargets.saveAndSelectResumeJob("bob", {
			resumeId: base,
			expectedUpdatedAt: original.updated_at.toISOString(),
			expectedSelectionRevision: changed.revision,
			role: "Engineer",
			employer: "",
			text: "Original edited again",
		}),
	);
	expect((await owned("bob", () => getJobEvidence("bob", base))).job?.text).toBe("Original edited again");
	expect((await owned("bob", () => getJobTargetRevision("bob", job.jobId, job.revision))).text).toBe("React SAP");
});

it("rolls back a saved ad when selection persistence fails and permits a clean retry", async () => {
	const owner = "job-rollback";
	await database
		.admin()
		.query(
			`INSERT INTO "user" (id,name,email,username,display_username) VALUES ($1,'Rollback','rollback@example.test',$1,$1)`,
			[owner],
		);
	const id = await owned(owner, () =>
		resumeService.create({ userId: owner, name: "Atomic comparison", tags: [], locale: "en-US" }),
	);
	const cv = (await database.admin().query("SELECT updated_at FROM resume WHERE id=$1", [id])).rows[0];
	const input = {
		resumeId: id,
		expectedUpdatedAt: cv.updated_at.toISOString(),
		expectedSelectionRevision: null,
		role: "Engineer",
		employer: "",
		text: "Exact original ad",
	};
	const first = await owned(owner, () => jobTargets.saveAndSelectResumeJob(owner, input));
	await database.admin().query(`
		CREATE FUNCTION reject_job_selection() RETURNS trigger LANGUAGE plpgsql AS $$
		BEGIN RAISE EXCEPTION 'synthetic selection storage failure'; END $$;
		CREATE TRIGGER reject_job_selection BEFORE INSERT OR UPDATE ON resume_job_selection
		FOR EACH ROW EXECUTE FUNCTION reject_job_selection();
	`);
	const edited = { ...input, expectedSelectionRevision: first.revision, text: "Edited ad" };
	try {
		await expect(owned(owner, () => jobTargets.saveAndSelectResumeJob(owner, edited))).rejects.toThrow();
		expect((await owned(owner, () => getJobEvidence(owner, id))).job?.text).toBe("Exact original ad");
		expect(
			(await database.admin().query("SELECT count(*)::int AS n FROM job_target WHERE user_id=$1", [owner])).rows[0].n,
		).toBe(1);
		expect(
			(await database.admin().query("SELECT count(*)::int AS n FROM job_target_revision WHERE user_id=$1", [owner]))
				.rows[0].n,
		).toBe(1);
	} finally {
		await database.admin().query("DROP TRIGGER reject_job_selection ON resume_job_selection");
	}
	await owned(owner, () => jobTargets.saveAndSelectResumeJob(owner, edited));
	expect((await owned(owner, () => getJobEvidence(owner, id))).job?.text).toBe("Edited ad");
	await expect(owned(owner, () => jobTargets.saveAndSelectResumeJob(owner, edited))).rejects.toMatchObject({
		code: "CONFLICT",
		data: { reason: "JOB_SELECTION_CHANGED" },
	});
	expect(
		(await database.admin().query("SELECT count(*)::int AS n FROM job_target WHERE user_id=$1", [owner])).rows[0].n,
	).toBe(2);
});
