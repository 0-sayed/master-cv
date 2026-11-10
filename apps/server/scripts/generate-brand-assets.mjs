import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

// Derived browser assets. The approved square SVG marks remain the source of truth.
const publicRoot = new URL("../../web/public/", import.meta.url);
const light = await readFile(new URL("master-cv/light.svg", publicRoot), "utf8");
const dark = await readFile(new URL("master-cv/dark.svg", publicRoot), "utf8");
const tokens = await readFile(new URL("../../../packages/ui/src/styles/globals.css", import.meta.url), "utf8");
const background = tokens.match(/--bg:\s*(#[\da-f]+)/i)[1];
const save = (name, bytes) => writeFile(new URL(name, publicRoot), bytes);

async function installIcon(size, scale = 0.8) {
	const markSize = Math.round(size * scale);
	const mark = await sharp(Buffer.from(light)).resize(markSize, markSize).png().toBuffer();
	return sharp({ create: { width: size, height: size, channels: 4, background } })
		.composite([{ input: mark, left: Math.floor((size - markSize) / 2), top: Math.floor((size - markSize) / 2) }])
		.png()
		.toBuffer();
}

for (const size of [64, 192, 512]) await save(`pwa-${size}x${size}.png`, await installIcon(size));
await save("apple-touch-icon-180x180.png", await installIcon(180));
// All ink fits inside the centered 80%-diameter safe circle, including at antialiased edges.
await save("maskable-icon-512x512.png", await installIcon(512, 0.64));

const favicon = light.replace(
	/<svg([^>]*)>/,
	"<svg$1><title>Master CV</title><style>@media(prefers-color-scheme:dark){#C{fill:#EFEEEB}#Tick{fill:#6FC082}}</style>",
);
await save("favicon.svg", favicon);
const sizes = [16, 32, 48, 64, 128, 256];
const pngs = await Promise.all(sizes.map((size) => sharp(Buffer.from(light)).resize(size, size).png().toBuffer()));
const directory = Buffer.alloc(6 + sizes.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
for (const [i, size] of sizes.entries()) {
	const entry = 6 + i * 16;
	directory[entry] = directory[entry + 1] = size === 256 ? 0 : size;
	directory.writeUInt16LE(1, entry + 4);
	directory.writeUInt16LE(32, entry + 6);
	directory.writeUInt32LE(pngs[i].length, entry + 8);
	directory.writeUInt32LE(offset, entry + 12);
	offset += pngs[i].length;
}
await save("favicon.ico", Buffer.concat([directory, ...pngs]));

// Compatibility URLs can remain cached by older clients, but must never display the upstream mark.
for (const [theme, svg] of [
	["light", light],
	["dark", dark],
]) {
	for (const family of ["icon", "logo"]) await save(`${family}/${theme}.svg`, svg);
}
await save("opengraph/logo.svg", light);

const deck = JSON.parse(
	await readFile(new URL("../../../Planning/context/design/copy-deck.json", import.meta.url), "utf8"),
);
const title = deck.entries.find((entry) => entry.key === "landing.hero.title").messages["en-US"];
const paths = light.match(/<g[\s\S]*<\/g>/)[0];
for (const [name, subtitle] of [
	["banner.jpg", title],
	["features.jpg", title],
	["ats-checker.png", "ATS checker"],
]) {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="${background}"/>
<g transform="translate(480 128) scale(7.5)">${paths}</g>
<text x="600" y="438" text-anchor="middle" font-family="Noto Sans, sans-serif" font-size="64" font-weight="600" fill="#1C1B15">Master CV</text>
<text x="600" y="500" text-anchor="middle" font-family="Noto Sans, sans-serif" font-size="28" fill="#1C1B15">${subtitle}</text></svg>`;
	const image = sharp(Buffer.from(svg));
	await save(`opengraph/${name}`, await (name.endsWith(".jpg") ? image.jpeg({ quality: 90 }) : image.png()).toBuffer());
}
