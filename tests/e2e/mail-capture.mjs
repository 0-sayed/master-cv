import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";

// Synthetic loopback SMTP sink. This belongs to the test harness, never the application.
const directory = resolve(process.env.E2E_MAIL_DIRECTORY ?? "test-results/mail");
await mkdir(directory, { recursive: true, mode: 0o700 });
const server = createServer((socket) => {
	let buffer = "";
	let data = false;
	let recipient = "";
	let raw = "";
	let login = 0;
	socket.setEncoding("utf8");
	socket.write("220 synthetic-mail ESMTP\r\n");
	socket.on("data", async (chunk) => {
		buffer += chunk;
		while (buffer.includes("\r\n")) {
			const end = buffer.indexOf("\r\n");
			const line = buffer.slice(0, end);
			buffer = buffer.slice(end + 2);
			if (data) {
				if (line !== ".") {
					raw += `${line.startsWith("..") ? line.slice(1) : line}\r\n`;
					continue;
				}
				data = false;
				const key = createHash("sha256").update(recipient.toLowerCase()).digest("hex");
				try {
					await mkdir(directory, { recursive: true, mode: 0o700 });
					await writeFile(
						resolve(directory, `${key}-${Date.now()}-${randomUUID()}.json`),
						JSON.stringify({ recipient, raw, at: Date.now() }),
						{ mode: 0o600 },
					);
					socket.write("250 captured\r\n");
				} catch {
					socket.write("451 Temporary capture failure; try again\r\n");
				} finally {
					raw = "";
				}
				continue;
			}
			if (login) {
				login--;
				socket.write(login ? "334 UGFzc3dvcmQ6\r\n" : "235 authenticated\r\n");
				continue;
			}
			if (/^EHLO|^HELO/i.test(line)) socket.write("250-synthetic-mail\r\n250 AUTH PLAIN LOGIN\r\n");
			else if (/^AUTH PLAIN/i.test(line)) socket.write("235 authenticated\r\n");
			else if (/^AUTH LOGIN/i.test(line)) {
				login = 2;
				socket.write("334 VXNlcm5hbWU6\r\n");
			} else if (/^RCPT TO:/i.test(line)) {
				recipient = line.match(/<([^>]+)>/)?.[1] ?? "";
				if (!recipient.endsWith(".test")) {
					socket.write("550 Synthetic test recipients only\r\n");
					continue;
				}
				socket.write("250 recipient\r\n");
			} else if (/^DATA$/i.test(line)) {
				data = true;
				socket.write("354 end with dot\r\n");
			} else if (/^QUIT$/i.test(line)) {
				socket.end("221 bye\r\n");
			} else socket.write("250 OK\r\n");
		}
	});
});
server.listen(Number(process.env.E2E_SMTP_PORT ?? 2526), "127.0.0.1", () =>
	console.info("Synthetic SMTP capture ready"),
);
process.on("SIGTERM", () => {
	server.close();
	process.exit(0);
});
