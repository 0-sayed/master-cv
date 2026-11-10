import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";

afterEach(() => vi.restoreAllMocks());

function picture(width: number, height: number, alpha: number) {
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
		drawImage: vi.fn(),
		getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, alpha]) }),
	} as unknown as CanvasRenderingContext2D);
	const view = render(
		<Avatar>
			<AvatarImage src="/picture.png" keepMounted alt="Portrait" />
			<AvatarFallback>س ع</AvatarFallback>
		</Avatar>,
	);
	const image = view.container.querySelector("img");
	if (!image) throw new Error("Avatar image missing");
	Object.defineProperties(image, { naturalWidth: { value: width }, naturalHeight: { value: height } });
	return { ...view, image };
}

it.each([
	[0, 32, 255],
	[32, 0, 255],
	[32, 32, 0],
])("shows initials for an empty image (%s x %s, alpha %s)", async (width, height, alpha) => {
	const { image } = picture(width, height, alpha);
	fireEvent.load(image);
	await waitFor(() => expect(screen.getByText("س ع")).toBeVisible());
	expect(image).not.toBeInTheDocument();
});

it("keeps a picture containing visible pixels", async () => {
	const { image } = picture(32, 32, 255);
	fireEvent.load(image);
	await waitFor(() => expect(screen.queryByText("س ع")).not.toBeInTheDocument());
	expect(image).toBeVisible();
});

it("restores initials when a successfully loaded test picture is removed", async () => {
	const { image, rerender } = picture(339, 91, 255);
	fireEvent.load(image);
	await waitFor(() => expect(image).toBeVisible());
	rerender(
		<Avatar>
			<AvatarImage src={undefined} />
			<AvatarFallback>س ع</AvatarFallback>
		</Avatar>,
	);
	await waitFor(() => expect(screen.getByText("س ع")).toBeVisible());
	expect(image).not.toBeInTheDocument();
});

it("falls back after an image error and recovers when its source changes", async () => {
	const { image, rerender } = picture(32, 32, 255);
	fireEvent.error(image);
	await waitFor(() => expect(screen.getByText("س ع")).toBeVisible());
	expect(image).not.toBeInTheDocument();
	rerender(
		<Avatar>
			<AvatarImage src="/replacement.png" keepMounted alt="Replacement" />
			<AvatarFallback>س ع</AvatarFallback>
		</Avatar>,
	);
	const replacement = screen.getByAltText("Replacement");
	Object.defineProperties(replacement, { naturalWidth: { value: 32 }, naturalHeight: { value: 32 } });
	fireEvent.load(replacement);
	await waitFor(() => expect(screen.queryByText("س ع")).not.toBeInTheDocument());
	expect(replacement).toBeVisible();
});

it("keeps a loaded external image when canvas pixel access is blocked", async () => {
	const { image } = picture(32, 32, 255);
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
		throw new DOMException("Tainted canvas", "SecurityError");
	});
	fireEvent.load(image);
	await waitFor(() => expect(screen.queryByText("س ع")).not.toBeInTheDocument());
	expect(image).toBeVisible();
});

it("hides an unvalidated image even in the initial server markup", async () => {
	const { renderToStaticMarkup } = await import("react-dom/server");
	const container = document.createElement("div");
	container.innerHTML = renderToStaticMarkup(
		<Avatar>
			<AvatarImage src="/pending.png" alt="الصورة الشخصية" />
			<AvatarFallback>س ع</AvatarFallback>
		</Avatar>,
	);
	document.body.append(container);
	try {
		const image = container.querySelector("img");
		expect(image).not.toBeVisible();
		expect(container.textContent).toBe("س ع");
	} finally {
		container.remove();
	}
});

it("defaults portraits to decorative alt text because initials identify the account", () => {
	const { container } = render(
		<Avatar>
			<AvatarImage src="/pending.png" />
			<AvatarFallback>س ع</AvatarFallback>
		</Avatar>,
	);
	expect(container.querySelector("img")).toHaveAttribute("alt", "");
});
