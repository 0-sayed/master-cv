import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { downloadPackage, installPoppler } from "./install-poppler.mjs";

const directories = [];
afterEach(async () => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
	await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bytes = Buffer.from("pinned package");
const item = {
	name: "fixture",
	url: "https://archive.ubuntu.com/ubuntu/pool/main/p/poppler/fixture.deb",
	sha256: hash(bytes),
};

async function cachedToolchain() {
	const root = await mkdtemp(join(tmpdir(), "poppler-cache-"));
	directories.push(root);
	await mkdir(join(root, "usr/bin"), { recursive: true });
	await mkdir(join(root, "usr/lib/x86_64-linux-gnu"), { recursive: true });
	const binary = '#!/bin/sh\necho "pdftotext version 22.02.0" >&2\n';
	const library = "fixture library";
	const pins = {
		poppler: {
			upstream: "22.02.0",
			revision: "fixture-revision",
			artifacts: { binary: hash(binary), library: hash(library) },
			packages: [item],
		},
	};
	await writeFile(join(root, "usr/bin/pdftotext"), binary, { mode: 0o755 });
	await writeFile(join(root, "usr/lib/x86_64-linux-gnu/libpoppler.so.118"), library);
	await writeFile(join(root, "pins.json"), JSON.stringify(pins));
	return { root, pins };
}

it("reuses a verified cache without any network access, including on the second invocation", async () => {
	const options = await cachedToolchain();
	const fetch = vi.fn(() => {
		throw new Error("network forbidden");
	});
	vi.stubGlobal("fetch", fetch);
	await installPoppler(options);
	await installPoppler(options);
	expect(fetch).not.toHaveBeenCalled();
	expect(await readFile(join(options.root, "bin/pdftotext"), "utf8")).toContain("__dirname");
});

it.each(["usr/bin/pdftotext", "usr/lib/x86_64-linux-gnu/libpoppler.so.118", "pins.json"])(
	"rejects a cache with modified %s",
	async (path) => {
		const options = await cachedToolchain();
		await writeFile(join(options.root, path), "corrupt");
		const fetch = vi.fn(async () => new Response("wrong checksum"));
		vi.stubGlobal("fetch", fetch);
		await expect(installPoppler(options)).rejects.toThrow("checksum mismatch");
		expect(fetch).toHaveBeenCalledTimes(1);
	},
);

it("retries transient DNS errors with backoff and a request timeout", async () => {
	vi.useFakeTimers();
	const fetch = vi.fn().mockRejectedValueOnce(new Error("EAI_AGAIN")).mockResolvedValue(new Response(bytes));
	vi.stubGlobal("fetch", fetch);
	const download = downloadPackage(item);
	await vi.runAllTimersAsync();
	expect(await download).toEqual(bytes);
	expect(fetch).toHaveBeenCalledTimes(2);
	expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
});

it("uses the same pinned path and checksum on the fallback mirror after bounded retries", async () => {
	vi.useFakeTimers();
	const fetch = vi.fn(async (url) => {
		if (new URL(url).hostname === "archive.ubuntu.com") throw new Error("EAI_AGAIN");
		return new Response(bytes);
	});
	vi.stubGlobal("fetch", fetch);
	const download = downloadPackage(item);
	await vi.runAllTimersAsync();
	expect(await download).toEqual(bytes);
	expect(fetch).toHaveBeenCalledTimes(4);
	expect(fetch.mock.calls[3][0]).toBe(item.url.replace("archive.ubuntu.com", "security.ubuntu.com"));
});

it("fails closed on a checksum mismatch without retries or mirror fallback", async () => {
	const fetch = vi.fn(async () => new Response("corrupt"));
	vi.stubGlobal("fetch", fetch);
	await expect(downloadPackage(item)).rejects.toThrow("checksum mismatch");
	expect(fetch).toHaveBeenCalledTimes(1);
});
