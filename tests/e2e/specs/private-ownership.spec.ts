import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { createAuthenticatedContext } from "../fixtures/auth";
import { createAccount } from "../fixtures/data";
import { deleteE2EUser } from "../fixtures/db";
import { test, expect } from "../fixtures/test";

test("real HTTP and restricted PostgreSQL deny foreign master, CV and file access", async ({
	authPage: alice,
	browser,
	baseURL,
	account,
}, testInfo) => {
	const bob = createAccount(testInfo);
	bob.username += "_b";
	bob.email = bob.username + "@example.test";
	const bootstrap = await browser.newContext({ baseURL });
	const context = await createAuthenticatedContext(browser, bootstrap.request, bob, baseURL ?? "http://localhost:3000");
	const other = context.request;
	let folder: string | undefined;
	let foreignFolder: string | undefined;
	try {
		const created = await alice.request.post("/api/openapi/resumes", {
			headers: { origin: baseURL ?? "http://localhost:3000" },
			data: { name: "Owned synthetic CV", tags: [], withSampleData: false },
		});
		expect(created.status()).toBe(200);
		const resumeId = await created.json();
		const owned = await alice.request.get(`/api/openapi/resumes/${resumeId}`);
		expect(owned.status()).toBe(200);
		const resume = await owned.json();
		const sharedEndpoint = `/api/openapi/resumes/${account.username}/${resume.slug}`;
		const pdfEndpoint = `/api/resumes/${account.username}/${resume.slug}/pdf`;
		expect((await alice.request.get(sharedEndpoint)).status()).toBe(200);
		const pdf = await alice.request.get(pdfEndpoint);
		expect(pdf.status()).toBe(200);
		expect(pdf.headers()["content-type"]).toContain("application/pdf");
		expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
		expect((await alice.request.post(`${sharedEndpoint}/statistics/download`, { data: {} })).status()).toBe(200);
		expect((await (await alice.request.get(`/api/openapi/resumes/${resumeId}/statistics`)).json()).downloads).toBe(0);
		expect((await other.get(pdfEndpoint)).status()).toBe(404);
		expect((await other.post(`${sharedEndpoint}/statistics/download`, { data: {} })).status()).toBe(404);
		expect((await other.get(sharedEndpoint)).status()).toBe(404);
		expect((await other.get(`/api/openapi/resumes/${resumeId}`)).status()).toBe(404);
		expect(
			(
				await other.delete(`/api/openapi/resumes/${resumeId}`, {
					headers: { origin: baseURL ?? "http://localhost:3000" },
				})
			).status(),
		).toBe(404);
		const fact = {
			section: "skills",
			entityId: "owned",
			field: "name",
			value: "Synthetic العربية",
			source: { kind: "manual", id: "owned", quote: "Synthetic العربية" },
		};
		const draft = await alice.request.post("/api/openapi/career/master/draft", {
			headers: { origin: baseURL ?? "http://localhost:3000" },
			data: { fact },
		});
		expect(draft.status()).toBe(200);
		const value = await draft.json();
		const forged = await other.post("/api/openapi/career/master/draft", {
			headers: { origin: baseURL ?? "http://localhost:3000" },
			data: {
				fact,
				version: { id: value.id, expectedRevision: value.revision, expectedDraftRevision: value.draftRevision },
			},
		});
		expect(forged.status()).toBe(404);
		const confirmed = await alice.request.post("/api/openapi/career/master/confirm", {
			headers: { origin: baseURL ?? "http://localhost:3000" },
			data: {
				facts: [{ id: value.id, expectedRevision: value.revision, expectedDraftRevision: value.draftRevision }],
				expectedProfileRevision: 0,
			},
		});
		expect(confirmed.status()).toBe(200);
		const foreignLink = await other.post("/api/openapi/career/master/links", {
			headers: { origin: baseURL ?? "http://localhost:3000" },
			data: { resumeId, links: [{ factId: value.id, acceptedRevision: 1 }] },
		});
		expect(foreignLink.status()).toBe(404);
		expect((await other.get("/api/openapi/career/master")).ok()).toBe(true);
		expect((await (await other.get("/api/openapi/career/master")).json()).facts).toEqual([]);
		const session = await (await alice.request.get("/api/auth/get-session")).json();
		const storage = process.env.LOCAL_STORAGE_PATH;
		if (!storage) throw new Error("Isolated local storage required");
		folder = join(storage, "uploads", session.user.id, "t003-proof");
		await mkdir(folder, { recursive: true });
		await writeFile(join(folder, "synthetic.txt"), "synthetic owner-only bytes");
		const path = `/uploads/${session.user.id}/t003-proof/synthetic.txt`;
		const own = await alice.request.get(path);
		expect(own.status()).toBe(200);
		expect(await own.text()).toBe("synthetic owner-only bytes");
		expect(own.headers()["cache-control"]).toContain("no-store");
		expect((await other.get(path)).status()).toBe(404);
		const anonymous = await browser.newContext({ baseURL });
		try {
			expect((await anonymous.request.get(path)).status()).toBe(404);
			expect((await anonymous.request.get(`/api/openapi/resumes/${resumeId}`)).status()).toBe(401);
			expect((await anonymous.request.get(sharedEndpoint)).status()).toBe(404);
			expect((await anonymous.request.get(pdfEndpoint)).status()).toBe(404);
			expect((await anonymous.request.post(`${sharedEndpoint}/statistics/download`, { data: {} })).status()).toBe(404);
		} finally {
			await anonymous.close();
		}
		expect((await alice.request.get(`/uploads/${session.user.id}/agent/thread/private`)).status()).toBe(404);
		const foreignSession = await (await other.get("/api/auth/get-session")).json();
		foreignFolder = join(storage, "uploads", foreignSession.user.id, "t003-proof");
		await mkdir(foreignFolder, { recursive: true });
		const foreignBytes = "synthetic foreign-owner traversal target";
		await writeFile(join(foreignFolder, "foreign.txt"), foreignBytes);
		const foreignPath = `/uploads/${foreignSession.user.id}/t003-proof/foreign.txt`;
		const foreignOwnerRead = await other.get(foreignPath);
		expect(foreignOwnerRead.status()).toBe(200);
		expect(await foreignOwnerRead.text()).toBe(foreignBytes);
		// Cover URL-normalized dots and encoded separators against the same existing foreign file.
		for (const traversal of [
			`%2e%2e/%2e%2e/${foreignSession.user.id}/t003-proof/foreign.txt`,
			`%2e%2e%2f%2e%2e%2f${foreignSession.user.id}%2ft003-proof%2fforeign.txt`,
		]) {
			const denied = await alice.request.get(`/uploads/${session.user.id}/t003-proof/${traversal}`);
			expect([400, 403, 404]).toContain(denied.status());
			expect(await denied.text()).not.toContain(foreignBytes);
		}
		expect(await (await other.get(foreignPath)).text()).toBe(foreignBytes);
		// An authenticated foreign viewer gets public access, never the owner's private scope.
		expect((await alice.request.put(`/api/openapi/resumes/${resumeId}`, { data: { isPublic: true } })).ok()).toBe(true);
		expect((await other.get(sharedEndpoint)).status()).toBe(200);
		expect((await other.post(`${sharedEndpoint}/statistics/download`, { data: {} })).status()).toBe(200);
		expect((await other.get(`/api/openapi/resumes/${resumeId}`)).status()).toBe(404);
		expect((await other.get(path)).status()).toBe(404);
		expect((await alice.request.put(`/api/openapi/resumes/${resumeId}`, { data: { isPublic: false } })).ok()).toBe(
			true,
		);
		expect((await other.get(sharedEndpoint)).status()).toBe(404);
		expect(
			(
				await alice.request.put(`/api/openapi/resumes/${resumeId}/password`, {
					data: { password: "Synthetic-pass-123" }, // Synthetic disposable fixture. gitleaks:allow
				})
			).status(),
		).toBe(200);
		expect((await alice.request.get(pdfEndpoint)).status()).toBe(200);
	} finally {
		if (folder) await rm(folder, { recursive: true, force: true });
		if (foreignFolder) await rm(foreignFolder, { recursive: true, force: true });
		await context.close();
		await bootstrap.close();
		await deleteE2EUser(bob);
	}
});
