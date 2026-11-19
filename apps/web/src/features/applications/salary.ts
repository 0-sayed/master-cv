import { msg } from "@lingui/core/macro";

export type SalaryDisplay =
	| { kind: "sar-range"; lower: string; upper: string; period: string | null }
	| { kind: "text"; text: string };

export function splitSalary(value: string): SalaryDisplay {
	const match = /^(\d+)\s*[–-]\s*(\d+)\s+SAR(?:\s*\/\s*([^/\r\n]+))?$/u.exec(value);
	const lower = match?.[1];
	const upper = match?.[2];
	if (!lower || !upper || BigInt(lower) > BigInt(upper)) return { kind: "text", text: value };
	return { kind: "sar-range", lower, upper, period: match?.[3]?.trim() || null };
}

const periodMessages = {
	month: msg({ message: "Monthly", context: "applications.salary.period.month" }),
	year: msg({ message: "Annually", context: "applications.salary.period.year" }),
	week: msg({ message: "Weekly", context: "applications.salary.period.week" }),
	day: msg({ message: "Daily", context: "applications.salary.period.day" }),
	hour: msg({ message: "Hourly", context: "applications.salary.period.hour" }),
};
export function salaryPeriodMessage(period: string) {
	const normalized = period.trim().toLowerCase();
	if (["month", "monthly", "شهر", "شهري", "شهريا", "شهريًا"].includes(normalized)) return periodMessages.month;
	if (["year", "yearly", "annual", "annually", "سنة", "عام", "سنوي", "سنويا", "سنويًا"].includes(normalized))
		return periodMessages.year;
	if (["week", "weekly", "أسبوع", "اسبوع", "أسبوعيًا", "أسبوعيا"].includes(normalized)) return periodMessages.week;
	if (["day", "daily", "يوم", "يوميًا", "يوميا"].includes(normalized)) return periodMessages.day;
	if (["hour", "hourly", "ساعة", "بالساعة"].includes(normalized)) return periodMessages.hour;
	return null;
}
