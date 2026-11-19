// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { exportFunnelPng } from "./insights-export";

const input = {
	rows: [
		{ status: "applied" as const, label: "تم التقديم", count: 18, percentage: 100 },
		{ status: "screening" as const, label: "الفحص", count: 10, percentage: (10 / 18) * 100 },
		{ status: "interview" as const, label: "مقابلة", count: 6, percentage: (6 / 18) * 100 },
		{ status: "offer" as const, label: "عرض وظيفي", count: 2, percentage: (2 / 18) * 100 },
	],
	sent: 18,
	asOf: new Date("2026-11-18T22:00:00Z"),
	locale: "ar-SA" as const,
};
let source = "";
let click: ReturnType<typeof vi.spyOn>;
let decode: ReturnType<typeof vi.fn>;
const context = {
	fillRect: vi.fn(),
	drawImage: vi.fn(),
	measureText: (text: string) => ({ width: text.length * 10 }),
	fillStyle: "",
	font: "",
};
beforeEach(() => {
	const css = readFileSync(new NodeURL("../../../../../packages/ui/src/styles/globals.css", import.meta.url), "utf8");
	const rootTokens = css.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1];
	if (!rootTokens) throw new Error("Shared light-theme tokens are missing");
	for (const token of rootTokens.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
		const [, name, value] = token;
		if (!name || !value) throw new Error("Invalid shared theme token");
		document.documentElement.style.setProperty(name, value);
	}
	document.documentElement.style.setProperty("--font-ui", '"Noto Sans", "Noto Sans Arabic", sans-serif');
	const style = document.createElement("style");
	style.textContent =
		'@font-face{font-family:"Noto Sans";font-style:normal;src:url(/latin.woff2)} @font-face{font-family:"Noto Sans Arabic";font-style:normal;src:url(/arabic.ttf)}';
	document.head.append(style);
	Object.defineProperty(document, "fonts", {
		configurable: true,
		value: { ready: Promise.resolve(), load: vi.fn(async () => [{}]) },
	});
	vi.stubGlobal(
		"fetch",
		vi.fn(
			async () =>
				new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M0 0h32v32H0z"/></svg>'),
		),
	);
	decode = vi.fn(async () => {});
	vi.stubGlobal(
		"Image",
		class {
			set src(value: string) {
				source = decodeURIComponent(value.slice(value.indexOf(",") + 1));
			}
			decode = decode;
		},
	);
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
	vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,cG5nY29udGVudGJ5dGVz");
	click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => {
	document.head.querySelectorAll("style").forEach((style) => style.remove());
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});
it("exports the same historical population", async () => {
	await exportFunnelPng(input);
	for (const row of input.rows) {
		expect(source).toContain(row.label);
		expect(source).toContain(`${row.count} / 18`);
	}
	expect(source).toContain("19");
	expect(source).toContain("data:image/svg+xml");
	expect(source).toContain("data:font/woff2;base64");
	expect(source).toContain("data:font/ttf;base64");
	expect(source).toContain('format("truetype")');
	expect(click).toHaveBeenCalledOnce();
});
it.each(["ar-SA", "en-US"] as const)("exports distinct stage fills with isolated %s statistics", async (locale) => {
	await exportFunnelPng({ ...input, locale });
	const svg = new DOMParser().parseFromString(source, "image/svg+xml");
	const bars = [...svg.querySelectorAll('rect[height="8"]')].filter((_, index) => index % 2 === 1);
	const colors = ["applied", "screening", "interview", "offer"].map((stage) =>
		getComputedStyle(document.documentElement).getPropertyValue(`--stage-${stage}`).trim(),
	);
	expect(new Set(colors).size).toBe(4);
	expect(bars.map((bar) => bar.getAttribute("fill"))).toEqual(colors);
	expect([...svg.querySelectorAll('text[direction="ltr"]')].some((node) => node.textContent === "18 / 18 · 100%")).toBe(
		true,
	);
});
it("awaits font and image readiness", async () => {
	let ready!: () => void;
	Object.defineProperty(document, "fonts", {
		configurable: true,
		value: {
			ready: new Promise<void>((resolve) => {
				ready = resolve;
			}),
			load: vi.fn(async () => [{}]),
		},
	});
	const pending = exportFunnelPng(input);
	expect(click).not.toHaveBeenCalled();
	ready();
	await pending;
	expect(decode).toHaveBeenCalledOnce();
	expect(click).toHaveBeenCalledOnce();
});
it("reports export failure without success", async () => {
	decode.mockRejectedValue(new Error("decode failed"));
	await expect(exportFunnelPng(input)).rejects.toThrow("decode failed");
	expect(click).not.toHaveBeenCalled();
});
it("rejects missing assets and fonts", async () => {
	vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 404 }));
	await expect(exportFunnelPng(input)).rejects.toThrow();
	Object.defineProperty(document, "fonts", {
		configurable: true,
		value: { ready: Promise.resolve(), load: vi.fn(async () => []) },
	});
	await expect(exportFunnelPng(input)).rejects.toThrow();
	expect(click).not.toHaveBeenCalled();
});
it("rejects unavailable canvas and invalid PNG output", async () => {
	vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValueOnce(null);
	await expect(exportFunnelPng(input)).rejects.toThrow("PNG canvas is unavailable");
	vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockReturnValueOnce("data:,");
	await expect(exportFunnelPng(input)).rejects.toThrow();
	expect(click).not.toHaveBeenCalled();
});
