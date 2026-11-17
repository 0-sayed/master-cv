import type { Pool } from "pg";
import { createHash } from "node:crypto";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
/** Explicit graph, including no-FK auth references, source RESTRICT edges and append-only rows. */
export async function seedPersonalData(pool: Pool, owner: "alice" | "bob") {
	const id = (name: string) => `${owner}-${name}`;
	const bytes = new TextEncoder().encode(`${owner}: سيرة ذاتية / full revision`);
	const key = `uploads/${owner}/originals/cv.txt`;
	const rows: Record<string, Record<string, unknown>[]> = {
		account: [
			{
				id: id("external-account"),
				user_id: owner,
				account_id: owner,
				provider_id: "synthetic",
				password: "SECRET_SENTINEL",
				access_token: "SECRET_SENTINEL",
			},
		],
		session: [
			{
				id: id("metadata-session"),
				user_id: owner,
				token: id("SECRET_SENTINEL"),
				expires_at: new Date(Date.now() + 86400000),
			},
		],
		verification: [
			{ id: id("verification"), identifier: id("reset"), value: owner, expires_at: new Date(Date.now() + 3600000) },
		],
		two_factor: [
			{ id: id("mfa"), user_id: owner, secret: "SECRET_SENTINEL", backup_codes: "SECRET_SENTINEL", verified: false },
		],
		passkey: [
			{
				id: id("passkey"),
				user_id: owner,
				public_key: "SECRET_SENTINEL",
				credential_id: id("credential"),
				counter: 0,
				device_type: "singleDevice",
				transports: "internal",
			},
		],
		apikey: [{ id: id("api-key"), reference_id: owner, key: id("SECRET_SENTINEL") }],
		oauth_client: [
			{
				id: id("client"),
				client_id: id("client"),
				user_id: owner,
				reference_id: owner,
				client_secret: "SECRET_SENTINEL",
				redirect_uris: ["http://localhost:3030/callback"],
			},
		],
		oauth_refresh_token: [
			{
				id: id("refresh"),
				client_id: id("client"),
				user_id: owner,
				token: id("refresh-SECRET_SENTINEL"),
				scopes: ["profile"],
			},
		],
		oauth_access_token: [
			{
				id: id("access"),
				client_id: id("client"),
				user_id: owner,
				refresh_id: id("refresh"),
				token: id("access-SECRET_SENTINEL"),
				scopes: ["profile"],
			},
		],
		oauth_consent: [{ id: id("consent"), client_id: id("client"), user_id: owner, scopes: ["profile"] }],
		oauth_resource: [
			{ id: id("resource"), identifier: `https://${owner}.example.test`, name: "Synthetic global resource" },
		],
		oauth_client_resource: [
			{ id: id("client-resource"), client_id: id("client"), resource_id: `https://${owner}.example.test` },
		],
		application: [
			{
				id: id("application"),
				user_id: owner,
				company: "Synthetic employer",
				role: "Engineer",
				notes: id("APPLICATION_SENTINEL"),
			},
		],
		resume: [
			{ id: id("base"), user_id: owner, name: "السيرة الأصلية", slug: id("base"), data: defaultResumeData },
			{
				id: id("language"),
				user_id: owner,
				name: "English copy",
				slug: id("language"),
				data: defaultResumeData,
				base_resume_id: id("base"),
				variant_kind: "language",
				trashed_at: new Date(),
				is_public: true,
			},
			{
				id: id("job-copy"),
				user_id: owner,
				name: "Job copy",
				slug: id("job-copy"),
				data: defaultResumeData,
				base_resume_id: id("base"),
				variant_kind: "job",
			},
		],
		resume_version: [
			{
				id: id("version"),
				user_id: owner,
				resume_id: id("base"),
				data: { ...defaultResumeData, basics: { ...defaultResumeData.basics, headline: id("REVISION_SENTINEL") } },
			},
		],
		cover_letter: [
			{ id: id("letter"), user_id: owner, name: "Cover letter", style: {}, content: id("LETTER_SENTINEL") },
		],
		cover_letter_version: [
			{
				id: id("letter-version"),
				user_id: owner,
				cover_letter_id: id("letter"),
				data: { content: id("LETTER_REVISION_SENTINEL") },
			},
		],

		career_profile: [{ user_id: owner, data: { name: id("PROFILE_SENTINEL") } }],
		job_target: [{ id: id("job"), user_id: owner }],
		job_target_revision: [
			{
				user_id: owner,
				job_id: id("job"),
				revision: "1",
				role: "Engineer",
				text: id("JOB_AD_SENTINEL"),
				digest: "synthetic",
			},
		],
		career_fact: [
			{
				id: id("fact"),
				user_id: owner,
				text: id("FACT_SENTINEL"),
				category: "achievement",
				source: { kind: "manual", id: id("manual"), quote: "Synthetic fact" },
				source_key: id("source"),
			},
		],
		career_fact_revision: [
			{ user_id: owner, fact_id: id("fact"), revision: 1, structured: { text: id("FACT_REVISION_SENTINEL") } },
		],
		resume_fact_link: [{ user_id: owner, resume_id: id("base"), fact_id: id("fact"), accepted_revision: 1 }],
		resume_job_selection: [{ user_id: owner, resume_id: id("job-copy"), job_id: id("job"), job_revision: "1" }],
		resume_variant_source: [
			{
				user_id: owner,
				resume_id: id("language"),
				source_resume_id: id("base"),
				source_revision: "1",
				target_locale: "en-US",
				request_key: id("variant-request"),
				request_hash: "synthetic",
			},
		],
		resume_slug_redirect: [
			{
				id: id("redirect"),
				user_id: owner,
				resume_id: id("base"),
				slug: id("old-slug"),
				expires_at: new Date(Date.now() + 86400000),
			},
		],
		resume_statistics: [{ id: id("statistics"), resume_id: id("base"), views: 3 }],
		resume_statistics_daily: [{ id: id("daily-statistics"), resume_id: id("base"), date: "2026-11-14", views: 2 }],
		career_story: [{ id: id("story"), user_id: owner, data: { text: id("STORY_SENTINEL") } }],
		career_artifact: [
			{
				id: id("artifact"),
				user_id: owner,
				title: "Synthetic artifact",
				data: { text: id("ARTIFACT_SENTINEL") },
				evidence: [],
				input_version: "1",
			},
		],
		career_schedule: [
			{ id: id("schedule"), user_id: owner, kind: "discover", next_run_at: new Date(Date.now() + 86400000) },
		],
		career_job: [
			{ id: id("scheduled-job"), user_id: owner, schedule_id: id("schedule"), due_at: new Date(Date.now() + 86400000) },
		],
		career_notification: [
			{ id: id("notification"), user_id: owner, key: id("notification"), notice: { text: id("NOTICE_SENTINEL") } },
		],
		career_opportunity: [
			{
				id: id("opportunity"),
				user_id: owner,
				url: `https://${owner}.example.test/job`,
				snippet: id("OPPORTUNITY_SENTINEL"),
			},
		],
		career_workspace: [{ application_id: id("application"), user_id: owner, data: { text: id("WORKSPACE_SENTINEL") } }],
		career_transcript: [
			{
				id: id("transcript"),
				user_id: owner,
				original: id("TRANSCRIPT_SENTINEL"),
				edited: "Synthetic correction",
				model: "scripted",
			},
		],
		ai_providers: [
			{
				id: id("provider"),
				user_id: owner,
				label: "Scripted provider",
				provider: "openai",
				model: "synthetic",
				encrypted_api_key: "SECRET_SENTINEL",
				api_key_salt: "SECRET_SENTINEL",
				api_key_hash: "SECRET_SENTINEL",
				api_key_preview: "SECRET_SENTINEL",
			},
		],
		agent_threads: [{ id: id("thread"), user_id: owner, title: id("THREAD_SENTINEL"), ai_provider_id: id("provider") }],
		agent_messages: [
			{
				id: id("message"),
				user_id: owner,
				thread_id: id("thread"),
				role: "user",
				sequence: 1,
				ui_message: {
					text: id("MESSAGE_SENTINEL"),
					authorization: "SECRET_SENTINEL",
					tool: { api_key: "SECRET_SENTINEL" },
				},
			},
		],
		agent_attachments: [
			{
				id: id("attachment"),
				user_id: owner,
				thread_id: id("thread"),
				storage_key: key,
				filename: "cv.txt",
				media_type: "text/plain",
				size: bytes.length,
			},
		],
		agent_actions: [
			{
				id: id("action"),
				user_id: owner,
				thread_id: id("thread"),
				kind: "resume_patch",
				title: id("ACTION_SENTINEL"),
				operations: [],
				base_updated_at: new Date(),
				applied_updated_at: new Date(),
			},
		],
		web_access_credentials: [{ user_id: owner, provider: "synthetic", encrypted_api_key: "SECRET_SENTINEL" }],
		ai_operation: [
			{
				id: id("operation"),
				user_id: owner,
				request_key: id("operation-request"),
				fingerprint: "synthetic",
				kind: "import",
				sources: [],
				route: { routeId: "synthetic", routeRevision: "1", configRevision: "1" },
				consent_version: "1",
				prompt_version: "1",
				schema_version: "1",
				parameters: { note: id("OPERATION_SENTINEL"), token: "SECRET_SENTINEL" },
			},
		],
		cover_letter_proposal_decision: [
			{
				operation_id: id("operation"),
				user_id: owner,
				letter_id: id("letter"),
				base_revision: 1,
				decision: "accept",
				request_key: "SECRET_SENTINEL",
				version_id: id("letter-version"),
			},
		],
		ai_operation_attempt: [
			{
				id: id("attempt"),
				user_id: owner,
				operation_id: id("operation"),
				ordinal: 1,
				step_id: "synthetic",
				finished_at: new Date(),
				cost_micros: 7,
				output: { text: id("ATTEMPT_SENTINEL") },
			},
		],
		ai_usage_ledger: [{ id: id("ledger"), user_id: owner, operation_id: id("operation"), kind: "reserve" }],
		ai_processing_consent: [
			{
				id: id("processing-consent"),
				user_id: owner,
				route_id: "synthetic",
				route_revision: "1",
				config_revision: "1",
				notice_version: "1",
				purpose: "import",
			},
		],
		ai_import_review_source: [
			{
				id: id("import-source"),
				user_id: owner,
				flow_id: id("flow"),
				digest: "synthetic",
				section: "summary",
				selection: id("IMPORT_SENTINEL"),
				partial: false,
				expires_at: new Date(Date.now() + 86400000),
			},
		],
		ai_review_decision: [
			{
				id: id("decision"),
				user_id: owner,
				operation_id: id("operation"),
				resume_id: id("base"),
				request_key: id("decision"),
				fingerprint: "synthetic",
				event: "reject",
				subject_ids: ["summary"],
			},
		],
		ai_content_report: [
			{
				id: id("report"),
				user_id: owner,
				source: "synthetic",
				reason: "other",
				content: id("REPORT_SENTINEL"),
				note: "Synthetic report",
			},
		],
		stored_file: [
			{
				id: id("file"),
				user_id: owner,
				key,
				purpose: "original",
				content_type: "text/plain",
				size: bytes.length,
				digest: createHash("sha256").update(bytes).digest("hex"),
			},
		],
		account_action_proof: [
			{
				id: id("proof"),
				user_id: owner,
				session_id: id("metadata-session"),
				action: "export_account",
				request_nonce: id("nonce"),
				expires_at: new Date(Date.now() + 60000),
			},
		],
		account_email_change: [
			{
				id: id("email-change"),
				user_id: owner,
				session_id: id("metadata-session"),
				previous_email: `${owner}@example.test`,
				new_email: `${owner}-new@example.test`,
				locale: "en-US",
				request_nonce: id("email-nonce"),
				token_hash: "SECRET_SENTINEL",
				stage: "cancelled",
				expires_at: new Date(Date.now() + 3600000),
			},
		],
		account_data_export: [{ id: id("export"), user_id: owner, request_nonce: id("export-nonce"), status: "expired" }],
		privacy_work: [
			{
				id: id("completed-work"),
				user_id: owner,
				kind: "purge_document",
				request_id: id("past"),
				key: id("past"),
				status: "complete",
			},
		],
		support_request: [
			{
				id: id("support"),
				user_id: owner,
				request_nonce: id("support-nonce"),
				email: `${owner}@example.test`,
				subject: "privacy",
				message: id("SUPPORT_SENTINEL"),
			},
		],
	};
	for (const [table, items] of Object.entries(rows))
		for (const row of items) {
			const columns = Object.keys(row);
			const values = Object.values(row).map((value) =>
				value && typeof value === "object" && !(value instanceof Date) && !Array.isArray(value)
					? JSON.stringify(value)
					: value,
			);
			// JSON arrays differ from SQL arrays; classify them explicitly.
			for (const name of ["evidence", "operations", "sources", "subject_ids"])
				if (columns.includes(name)) values[columns.indexOf(name)] = JSON.stringify(row[name]);
			await pool.query(
				`INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(",")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")})`,
				values,
			);
		}
	return { tables: Object.keys(rows), key, bytes };
}
