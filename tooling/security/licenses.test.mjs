import { expect, it } from "vite-plus/test";
import { restrictedPackages } from "./licenses.mjs";

it("rejects GPL3 and AGPL3 additions while distinguishing LGPL and permissive packages", () => {
	expect(
		restrictedPackages({
			"GPL-3.0-only": [{ name: "restricted", versions: ["1.0.0"] }],
			"(AGPL-3.0-or-later OR MIT)": [{ name: "needs-review", versions: ["2.0.0"] }],
			"LGPL-3.0-or-later": [{ name: "existing-native-code", versions: ["3.0.0"] }],
			MIT: [{ name: "permissive", versions: ["1.0.0"] }],
		}),
	).toEqual(["restricted@1.0.0: GPL-3.0-only", "needs-review@2.0.0: (AGPL-3.0-or-later OR MIT)"]);
});
