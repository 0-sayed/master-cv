import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";

it("recovers removed capture directories and replies 451 on failed writes without losing the SMTP session", async () => {
	const root = await mkdtemp(join(tmpdir(), "master-cv-mail-"));
	const directory = join(root, "capture");
	const probe = createServer();
	probe.listen(0, "127.0.0.1");
	await once(probe, "listening");
	const address = probe.address();
	if (!address || typeof address === "string") throw new Error("Missing test port");
	await new Promise<void>((resolve) => probe.close(() => resolve()));
	const child = spawn(process.execPath, [new URL("../tests/e2e/mail-capture.mjs", import.meta.url).pathname], {
		env: { ...process.env, E2E_SMTP_PORT: String(address.port), E2E_MAIL_DIRECTORY: directory },
		stdio: ["ignore", "pipe", "pipe"],
	});
	const exited = once(child, "exit");
	await once(child.stdout, "data");
	const socket = connect(address.port, "127.0.0.1");
	let buffer = "";
	const replies: string[] = [];
	let pending: ((reply: string) => void) | undefined;
	socket.on("data", (chunk) => {
		buffer += chunk.toString();
		while (buffer.includes("\r\n")) {
			const end = buffer.indexOf("\r\n");
			const line = buffer.slice(0, end);
			buffer = buffer.slice(end + 2);
			if (pending) {
				const resolve = pending;
				pending = undefined;
				resolve(line);
			} else replies.push(line);
		}
	});
	const reply = () =>
		Promise.race([
			replies.length
				? Promise.resolve(replies.shift() ?? "")
				: new Promise<string>((resolve) => {
						pending = resolve;
					}),
			exited.then(() => {
				throw new Error("SMTP capture exited before replying");
			}),
		]);
	const command = (line: string) => {
		socket.write(line + "\r\n");
		return reply();
	};
	const message = async (subject: string) => {
		expect(await command("MAIL FROM:<sender@example.test>")).toMatch(/^250 /);
		expect(await command("RCPT TO:<recipient@example.test>")).toMatch(/^250 /);
		expect(await command("DATA")).toMatch(/^354 /);
		return command(`Subject: ${subject}\r\n\r\nSynthetic body\r\n.`);
	};
	try {
		expect(await reply()).toMatch(/^220 /);
		expect(await message("Before removal")).toMatch(/^250 /);
		await rm(directory, { recursive: true });
		expect(await message("After removal")).toMatch(/^250 /);
		const files = await readdir(directory);
		expect(files).toHaveLength(1);
		expect(JSON.parse(await readFile(join(directory, files[0] ?? ""), "utf8")).raw).toContain("After removal");
		await rm(directory, { recursive: true });
		await writeFile(directory, "Blocks directory creation");
		expect(await message("Temporary failure")).toMatch(/^451 /);
		expect(child.exitCode).toBeNull();
		await rm(directory);
		expect(await message("Recovered")).toMatch(/^250 /);
		expect(await command("QUIT")).toMatch(/^221 /);
	} finally {
		socket.destroy();
		child.kill("SIGTERM");
		await exited;
		await rm(root, { recursive: true });
	}
});
