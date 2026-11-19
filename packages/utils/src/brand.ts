export const productBrand = {
	name: "Sirawise",
	uppercaseName: "SIRAWISE",
	arabicName: "سيراوايز",
	primaryDomain: "sirawise.io",
	defaultEmailSender: "Sirawise <noreply@sirawise.io>",
} as const;

export function getProductName(locale: string): string {
	return locale === "ar" || locale === "ar-SA" ? productBrand.arabicName : productBrand.name;
}
