/** Independently authored text runs exercise contact boundaries and source links. */
export function ownerImportPdf() {
	const lines = [
		"Sara Example",
		"+20 106 449 4638",
		"2sara@example.test",
		"Work Experience",
		"Horizon Systems | Software Engineer",
		"2020 - 2022",
		"Built secure services",
	];
	const stream = `BT /F1 12 Tf 50 780 Td 20 TL ${lines.map((line, index) => `${index ? "T* " : ""}(${line}) Tj`).join("\n")} ET`;
	const objects = [
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
		`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
	];
	let pdf = "%PDF-1.4\n";
	const offsets = [0];
	for (const [index, object] of objects.entries()) {
		offsets.push(Buffer.byteLength(pdf));
		pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
	}
	const xref = Buffer.byteLength(pdf);
	pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	pdf += offsets
		.slice(1)
		.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
		.join("");
	pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
	return { name: "synthetic-owner-contact.pdf", mimeType: "application/pdf", buffer: Buffer.from(pdf) };
}
