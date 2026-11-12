export function isBaseCvLimit(error: unknown): boolean {
	return getCreationLimit(error) === "BASE_CV_LIMIT";
}

export function getCreationLimit(error: unknown): "BASE_CV_LIMIT" | "LANGUAGE_COPY_LIMIT" | "JOB_COPY_LIMIT" | null {
	const reasons = ["BASE_CV_LIMIT", "LANGUAGE_COPY_LIMIT", "JOB_COPY_LIMIT"] as const;
	if (
		!error ||
		typeof error !== "object" ||
		!("code" in error) ||
		error.code !== "PRECONDITION_FAILED" ||
		!("data" in error) ||
		!error.data ||
		typeof error.data !== "object" ||
		!("reason" in error.data)
	)
		return null;
	const candidate = error.data.reason;
	return reasons.find((reason) => reason === candidate) ?? null;
}
