import { readFile } from "node:fs/promises";
import { isFeatureAvailable } from "@reactive-resume/schema/personal-tools";
import { expect, test } from "../fixtures/test";

test("public API and MCP metadata identify this Sirawise instance", async ({ request, baseURL }) => {
	if (!baseURL) throw new Error("The browser test requires a configured baseURL");
	const origin = new URL(baseURL).origin;
	if (!isFeatureAvailable("userApi")) {
		for (const path of ["/openapi.json", "/.well-known/mcp/server-card.json"]) {
			const response = await request.get(path);
			expect(response.status()).toBe(403);
			expect(await response.json()).toEqual({ code: "FEATURE_UNAVAILABLE" });
		}
		return;
	}
	const specResponse = await request.get("/openapi.json");
	await expect(specResponse).toBeOK();
	const spec = await specResponse.json();
	expect(spec.info.title).toBe("Sirawise");
	expect(spec.info.contact).toEqual({ name: "Sirawise", url: "https://github.com/0-sayed/master-cv" });
	expect(spec.externalDocs.description).toBe("Upstream documentation");
	const cardResponse = await request.get("/.well-known/mcp/server-card.json");
	await expect(cardResponse).toBeOK();
	const { serverInfo } = await cardResponse.json();
	expect(serverInfo.title).toBe("Sirawise");
	expect(serverInfo.name).toBe("reactive-resume"); // Retain the machine identifier for existing clients.
	expect(serverInfo.websiteUrl).toBe(origin);
	for (const theme of ["light", "dark"]) {
		expect(serverInfo.icons).toContainEqual({
			src: `${origin}/master-cv/${theme}.svg`,
			mimeType: "image/svg+xml",
			theme,
		});
	}
});

test("obsolete upstream funding identity and install previews are no longer published", async ({ request }) => {
	const retired = ["/funding.json"];
	for (const viewport of ["web", "mobile"]) {
		for (const image of ["1-landing-page", "2-resume-dashboard", "3-builder-screen", "4-template-gallery"]) {
			retired.push(`/screenshots/${viewport}/${image}.webp`);
		}
	}
	for (const path of retired) {
		expect((await request.get(path)).status(), path).toBe(404);
	}
});

test("the downloaded application chart includes the Sirawise mark", async ({ authPage: page }) => {
	for (let index = 0; index < 5; index++) {
		await expect(
			await page.request.post("/api/openapi/applications", {
				data: { company: `Synthetic brand check ${index}`, role: "Engineer", status: "applied" },
			}),
		).toBeOK();
	}
	await page.goto("/dashboard/applications?view=insights");
	await expect(page.getByRole("heading", { name: "How far applications get", exact: true })).toBeVisible();
	await page.evaluate(() => {
		const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
		if (!descriptor?.set) throw new Error("Image source instrumentation is unavailable");
		const nativeSetter = descriptor.set;
		Object.defineProperty(HTMLImageElement.prototype, "src", {
			...descriptor,
			set(value: string) {
				if (value.startsWith("data:image/svg+xml"))
					document.documentElement.dataset.funnelSvg = decodeURIComponent(value.slice(value.indexOf(",") + 1));
				nativeSetter.call(this, value);
			},
		});
	});
	const pending = page.waitForEvent("download");
	await page.getByRole("button", { name: "Export PNG", exact: true }).click();
	const download = await pending;
	const svg = await page.locator("html").getAttribute("data-funnel-svg");
	expect(svg).toContain("5 / 5");
	expect(svg).toContain("Applications sent");
	expect(svg).toContain(
		new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", year: "numeric" }).format(new Date()),
	);
	expect(await download.failure()).toBeNull();
	const path = await download.path();
	if (!path) throw new Error("The chart export did not produce a file");
	const png = await readFile(path);
	expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
	const colors = await page.evaluate(async (base64) => {
		const image = new Image();
		image.src = `data:image/png;base64,${base64}`;
		await image.decode();
		const canvas = document.createElement("canvas");
		canvas.width = canvas.height = 54;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Canvas is unavailable");
		context.drawImage(image, image.width - 78, image.height - 78, 54, 54, 0, 0, 54, 54);
		const pixels = context.getImageData(0, 0, 54, 54).data;
		let green = 0;
		let light = 0;
		for (let i = 0; i < pixels.length; i += 4) {
			if (Math.abs(pixels[i] - 111) < 3 && Math.abs(pixels[i + 1] - 192) < 3 && Math.abs(pixels[i + 2] - 130) < 3)
				green++;
			if (Math.abs(pixels[i] - 239) < 3 && Math.abs(pixels[i + 1] - 238) < 3 && Math.abs(pixels[i + 2] - 235) < 3)
				light++;
		}
		return { green, light };
	}, png.toString("base64"));
	expect(colors.green).toBeGreaterThan(20);
	expect(colors.light).toBeGreaterThan(50);
});
