import { expect, it, vi } from "vite-plus/test";
import { MAX_IMAGE_BYTES } from "./images";
import { readServerImage } from "./images.node";

vi.mock("node:dns", () => ({
	lookup: (
		_host: string,
		_options: unknown,
		callback: (error: null, addresses: { address: string; family: number }[]) => void,
	) => callback(null, [{ address: "127.0.0.1", family: 4 }]),
}));

it("rejects private origins and requires scoped authorization even for matching upload paths", async () => {
	await expect(readServerImage("http://127.0.0.1/private.png")).rejects.toThrow(/refused/);
	await expect(readServerImage("http://rebound.example/picture.png")).rejects.toThrow(/Private/);
	await expect(
		readServerImage("http://localhost/api/uploads/user/pictures/picture.png", "http://localhost"),
	).rejects.toThrow(/authorization/);
});
it("bounds scoped picture bytes and honors cancellation", async () => {
	const picture = "http://localhost/api/uploads/user/pictures/picture.png";
	await expect(
		readServerImage(picture, "http://localhost", undefined, 0, () =>
			Promise.resolve(Buffer.alloc(MAX_IMAGE_BYTES + 1)),
		),
	).rejects.toThrow(/12 MB/);
	const controller = new AbortController();
	controller.abort();
	expect(() =>
		readServerImage(picture, "http://localhost", controller.signal, 0, () => Promise.resolve(new Uint8Array([1]))),
	).toThrow();
});
it("own_picture_requires_scoped_reader_and_never_fetches_as_public", async () => {
	await expect(
		readServerImage("http://localhost:3030/api/uploads/alice/pictures/a.png", "http://localhost:3030"),
	).rejects.toThrow();
	const reader = vi.fn().mockResolvedValue(new Uint8Array([1]));
	expect(
		await readServerImage(
			"http://localhost:3030/api/uploads/alice/pictures/a.png",
			"http://localhost:3030",
			AbortSignal.timeout(100),
			0,
			reader,
		),
	).toEqual(new Uint8Array([1]));
	expect(reader).toHaveBeenCalledWith("uploads/alice/pictures/a.png");
});
