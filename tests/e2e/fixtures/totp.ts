import { createHmac } from "node:crypto";
export function totpCode(totpURI: string) {
	const encoded = new URL(totpURI).searchParams.get("secret");
	if (!encoded) throw new Error("Synthetic MFA secret missing");
	const bits = [...encoded.toUpperCase()]
		.map((c) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(c).toString(2).padStart(5, "0"))
		.join("");
	const key = Buffer.from(bits.match(/.{8}/g)?.map((byte) => Number.parseInt(byte, 2)) ?? []);
	const counter = Buffer.alloc(8);
	counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
	const digest = createHmac("sha1", key).update(counter).digest();
	const offset = digest[digest.length - 1] & 15;
	return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
}
