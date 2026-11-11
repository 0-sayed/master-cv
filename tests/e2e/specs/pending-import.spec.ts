import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { openPdfReview } from "../fixtures/import-review";
import { expect, test } from "../fixtures/test";

test("pending imports are claimed once, by their owner and flow, before expiry", async ({ authPage: page }) => {
	await page.goto("/dashboard");
	const source = stripTypeScriptTypes(
		await readFile("apps/web/src/features/ats-checker/pending-import.ts", "utf8"),
	).replaceAll("export ", "");
	const result = await page.evaluate(async (source) => {
		const { savePendingImport: save, takePendingImport: take } = new Function(
			`${source}; return {savePendingImport,takePendingImport};`,
		)();
		const identity = { ownerId: "alice", flowId: crypto.randomUUID() };
		const file = new File(["%PDF-synthetic"], "private.pdf");
		await save({ ...identity, file, expiresAt: Date.now() + 60000 });
		const foreign = await take({ ...identity, ownerId: "bob" });
		const wrongFlow = await take({ ...identity, flowId: "other" });
		const claims = await Promise.all([take(identity), take(identity)]);
		await save({ ...identity, file, expiresAt: Date.now() + 1000 });
		const expired = await take({ ...identity, now: Date.now() + 2000 });
		return {
			foreign: foreign === null,
			wrongFlow: wrongFlow === null,
			count: claims.filter(Boolean).length,
			expired: expired === null,
			text: await claims.find(Boolean)?.text(),
		};
	}, source);
	expect(result).toEqual({ foreign: true, wrongFlow: true, count: 1, expired: true, text: "%PDF-synthetic" });
});

test("the review route refuses another owner's draft and an expired draft", async ({ authPage: page }) => {
	await openPdfReview(page);
	const url = page.url();
	await page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const req = indexedDB.open("master-cv-import-review", 1);
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
		try {
			await new Promise<void>((resolve, reject) => {
				const tx = db.transaction("drafts", "readwrite");
				const store = tx.objectStore("drafts");
				const req = store.getAll();
				req.onsuccess = () => {
					for (const value of req.result) {
						store.delete(JSON.stringify([value.ownerId, value.flowId]));
						value.ownerId = "another-synthetic-owner";
						store.put(value, JSON.stringify([value.ownerId, value.flowId]));
					}
				};
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
			});
		} finally {
			db.close();
		}
	});
	await page.goto(url);
	await expect(
		page.getByText("This import review has expired or is unavailable on this device. Choose your file again.", {
			exact: true,
		}),
	).toBeVisible();
	await openPdfReview(page);
	const expiring = page.url();
	await page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const req = indexedDB.open("master-cv-import-review", 1);
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
		try {
			await new Promise<void>((resolve, reject) => {
				const tx = db.transaction("drafts", "readwrite");
				const cursor = tx.objectStore("drafts").openCursor();
				cursor.onsuccess = () => {
					const row = cursor.result;
					if (!row) return;
					row.update({ ...row.value, expiresAt: Date.now() - 1 });
					row.continue();
				};
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
			});
		} finally {
			db.close();
		}
	});
	await page.goto(expiring);
	await expect(
		page.getByText("This import review has expired or is unavailable on this device. Choose your file again.", {
			exact: true,
		}),
	).toBeVisible();
});
