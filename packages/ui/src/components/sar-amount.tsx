import type { UiLocale } from "@reactive-resume/utils/locale";
type SarAmountProps = { minorUnits: number; locale: UiLocale; currencyLabel: string };
/** Display only: no fee calculation or inferred price parsing. Vector: Figma Currency/SAR 6:27. */
export function SarAmount({ minorUnits, locale, currencyLabel }: SarAmountProps) {
	if (!Number.isSafeInteger(minorUnits) || minorUnits < 0)
		throw new RangeError("Expected nonnegative safe integer minor units");
	const amount = BigInt(minorUnits);
	const formatter = new Intl.NumberFormat(locale, {
		numberingSystem: "latn",
		useGrouping: true,
		maximumFractionDigits: 0,
	});
	const decimal =
		new Intl.NumberFormat(locale, { numberingSystem: "latn" })
			.formatToParts(1.1)
			.find((part) => part.type === "decimal")?.value ?? ".";
	const text = `${formatter.format(amount / 100n)}${decimal}${String(amount % 100n).padStart(2, "0")}`;
	return (
		<span
			dir="ltr"
			className="inline-flex items-center gap-1.5 align-baseline whitespace-nowrap [unicode-bidi:isolate]"
		>
			<svg
				role="img"
				aria-label={currencyLabel}
				viewBox="0 0 9.84224 11"
				className="h-[0.8em] w-auto shrink-0"
				fill="currentColor"
				focusable="false"
			>
				<path d="M6.12552 9.74471C5.9499 10.1341 5.83382 10.5568 5.78934 10.9999L9.50599 10.2099C9.68161 9.82054 9.79763 9.39784 9.84218 8.95465L6.12552 9.74471Z" />
				<path d="M9.5058 7.84284C9.68145 7.45351 9.79753 7.03081 9.84201 6.58762L6.94685 7.20337V6.01968L9.50573 5.47591C9.68135 5.08655 9.79743 4.66388 9.84191 4.22069L6.94678 4.83589V0.578978C6.50314 0.82806 6.10917 1.15962 5.78891 1.55071V5.08211L4.63103 5.3282V0C4.18743 0.248996 3.79342 0.580642 3.47316 0.971732V5.57422L0.882432 6.12476C0.706802 6.51409 0.590622 6.9368 0.546059 7.37999L3.47316 6.75791V8.24856L0.336197 8.91519C0.160569 9.30452 0.044476 9.72722 0 10.1704L3.28353 9.47261C3.55081 9.41703 3.78057 9.25901 3.92993 9.04152L4.5321 8.14878C4.59463 8.05641 4.63103 7.94487 4.63103 7.8249V6.51182L5.78891 6.2657V8.63308L9.5058 7.84284Z" />
			</svg>
			<span>{text}</span>
		</span>
	);
}
