/** Stop dispatch on either signal; existing bounded calls drain and journal their bills. */
export function gracefulDrain() {
	const controller = new AbortController();
	const interrupt = () => controller.abort();
	process.on("SIGINT", interrupt);
	process.on("SIGTERM", interrupt);
	return {
		signal: controller.signal,
		dispose() {
			process.off("SIGINT", interrupt);
			process.off("SIGTERM", interrupt);
		},
	};
}
