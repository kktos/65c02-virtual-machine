import { describe, expect, it } from "vitest";
import { formatFlags } from "@/lib/instructionTrace.lib";

describe("formatFlags", () => {
	it("upper-cases the set flags, NV-BDIZC order", () => {
		expect(formatFlags(0x00)).toBe("nv-bdizc");
		expect(formatFlags(0xff)).toBe("NV-BDIZC");
		expect(formatFlags(0x83)).toBe("Nv-bdiZC");
		expect(formatFlags(0x34)).toBe("nv-BdIzc");
	});
});
