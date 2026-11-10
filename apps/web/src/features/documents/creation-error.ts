export function isBaseCvLimit(error: unknown): boolean {
	return (
		!!error &&
		typeof error === "object" &&
		"code" in error &&
		error.code === "PRECONDITION_FAILED" &&
		"data" in error &&
		!!error.data &&
		typeof error.data === "object" &&
		"reason" in error.data &&
		error.data.reason === "BASE_CV_LIMIT"
	);
}
