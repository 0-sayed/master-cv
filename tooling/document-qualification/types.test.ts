import type { Gold } from "./types";
import { expectTypeOf, it } from "vite-plus/test";
it("requires review provenance for reviewed gold", () => {
	expectTypeOf<Gold["review"]>().toEqualTypeOf<
		{ status: "draft" } | { status: "reviewed"; reviewer: string; date: string }
	>();
});
