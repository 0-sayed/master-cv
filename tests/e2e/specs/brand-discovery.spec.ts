import { readFile } from "node:fs/promises";
import { expect, test } from "../fixtures/test";

test("public API and MCP metadata identify this Master CV instance", async ({ request, baseURL }) => {
	if (!baseURL) throw new Error("The browser test requires a configured baseURL");
	const origin = new URL(baseURL).origin;
	const specResponse = await request.get("/openapi.json");
	await expect(specResponse).toBeOK();
	const spec = await specResponse.json();
	expect(spec.info.title).toBe("Master CV");
	expect(spec.info.contact).toEqual({ name: "Master CV", url: "https://github.com/0-sayed/master-cv" });
	expect(spec.externalDocs.description).toBe("Upstream documentation");
	const cardResponse = await request.get("/.well-known/mcp/server-card.json");
	await expect(cardResponse).toBeOK();
	const { serverInfo } = await cardResponse.json();
	expect(serverInfo.title).toBe("Master CV");
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

test("the downloaded application chart includes the Master CV mark", async ({ authPage: page }) => {
	await expect(
		await page.request.post("/api/openapi/applications", {
			data: { company: "Synthetic brand check", role: "Engineer", status: "applied" },
		}),
	).toBeOK();
	await page.goto("/dashboard/applications?view=insights");
	await expect(page.getByRole("img", { name: "Pipeline flow", exact: true })).toBeVisible();
	const pending = page.waitForEvent("download");
	await page.getByRole("button", { name: "Export PNG", exact: true }).click();
	const download = await pending;
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
