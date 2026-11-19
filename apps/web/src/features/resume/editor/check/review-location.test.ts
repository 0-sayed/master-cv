import { expect, it } from "vite-plus/test";
import { reviewEvidenceLocation, reviewEvidenceStyle, reviewPdfIsCurrent, reviewTextLocation } from "./review-location";

it("maps split Arabic text-layer items to one precise page box and uses the section to resolve duplicates", () => {
	const spans = [
		{
			text: "قسم إضافي",
			dir: "rtl" as const,
			x: 145,
			y: 80,
			width: 80,
			height: 15,
			fontRef: "ar",
			fontSize: 12,
			streamIndex: 0,
		},
		{
			text: "1",
			dir: "ltr" as const,
			x: 60,
			y: 80,
			width: 10,
			height: 15,
			fontRef: "ar",
			fontSize: 12,
			streamIndex: 1,
		},
	];
	const line = {
		page: 7,
		text: "قسم إضافي 1",
		spans,
		x: 60,
		y: 80,
		width: 165,
		height: 15,
		fontSize: 12,
		fontRef: "ar",
		meanStreamIndex: 0,
	};
	const area = {
		kind: "section" as const,
		sectionId: "plan",
		key: "plan",
		page: 6,
		x: 50,
		y: 60,
		width: 200,
		height: 300,
	};
	const doc = { lines: [{ ...line, page: 1 }, line] };
	expect(reviewTextLocation(doc, "قسم إضافي 1", area)).toEqual({
		kind: "box",
		page: 7,
		box: { x: 60, y: 80, width: 165, height: 15 },
	});
	expect(reviewTextLocation(doc, "قسم إضافي 1")).toEqual({ kind: "document" });
	expect(reviewTextLocation(doc, "قسم إضافي 1", undefined, 7)).toEqual({
		kind: "box",
		page: 7,
		box: { x: 60, y: 80, width: 165, height: 15 },
	});
	expect(reviewTextLocation(doc, "Unavailable", undefined, 7)).toEqual({ kind: "page", page: 7 });
	expect(reviewTextLocation(doc, "Unavailable", area)).toEqual({ kind: "page", page: 7 });
	expect(reviewTextLocation(doc, "", area)).toEqual({ kind: "page", page: 7 });
});

it("requires matching document, rendered bytes, and completed readiness for PDF pins", () => {
	const identity = { ownerId: "owner", resumeId: "cv", baseRevision: "1", editGeneration: 0 };
	const rendered = { identity, bytesHash: "bytes", file: new Blob(["pdf"]) };
	const result = { state: "complete", source: { ...identity, bytesHash: "bytes" } };
	expect(reviewPdfIsCurrent(identity, rendered, result)).toBe(true);
	expect(reviewPdfIsCurrent(identity, rendered, { ...result, state: "failed" })).toBe(false);
	expect(reviewPdfIsCurrent(identity, rendered, { ...result, source: { ...identity, bytesHash: "old" } })).toBe(false);
	expect(reviewPdfIsCurrent({ ...identity, editGeneration: 1 }, rendered, result)).toBe(false);
});

it("uses document scope when evidence has no valid page", () => {
	expect(reviewEvidenceLocation(undefined, 2)).toEqual({ kind: "document" });
	expect(reviewEvidenceLocation({ page: 2 }, 2)).toEqual({ kind: "page", page: 2 });
	expect(reviewEvidenceLocation({ page: 3 }, 2)).toEqual({ kind: "document" });
	expect(reviewEvidenceLocation({ page: 0 }, 2)).toEqual({ kind: "document" });
	expect(reviewEvidenceLocation({ box: { x: 1, y: 2, width: 3, height: 4 } }, 2)).toEqual({ kind: "document" });
});

it("preserves supplied boxes and rejects nonfinite coordinates", () => {
	const box = { x: 60, y: 80, width: 120, height: 40 };
	expect(reviewEvidenceLocation({ page: 2, box }, 2)).toEqual({ kind: "box", page: 2, box });
	expect(reviewEvidenceLocation({ page: 2, box: { ...box, x: Infinity } }, 2)).toEqual({ kind: "document" });
	expect(reviewEvidenceStyle(box, { width: 600, height: 800 })).toEqual({
		left: "10%",
		top: "10%",
		width: "20%",
		height: "5%",
	});
	expect(reviewEvidenceStyle(box, { width: 300, height: 400 })).toEqual({
		left: "20%",
		top: "20%",
		width: "40%",
		height: "10%",
	});
});
