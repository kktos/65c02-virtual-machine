import { describe, expect, it, vi } from "vitest";

const FORMATS: Record<number, { type: string; length: number }> = {
	0x6300: { type: "byte", length: 256 }, // $6300: .db <256>
	0x6402: { type: "string", length: 12 }, // longer than the 5 bytes shown
	0x640e: { type: "word", length: 4 }, // 8 bytes, 5 shown
};

vi.mock("@/composables/useComments", () => ({ useComments: () => ({ getBothComments: () => ["", ""] }) }));
vi.mock("@/composables/useDataFormattings", () => ({
	useFormatting: () => ({ getFormat: (a: number) => FORMATS[a] }),
}));
vi.mock("@/composables/useSymbols", () => ({
	useSymbols: () => ({
		getSymbolForAddress: () => undefined,
		getLabelForAddress: () => undefined,
		findSymbolWithOffset: () => undefined,
		addManySymbols: vi.fn(),
		hasRangeFlag: () => false,
	}),
}));

const { disassembleRange } = await import("@/lib/disassembler");

const memory = new Uint8Array(0x10000);
memory.fill(0x20, 0x6300, 0x6400); // would read as JSR $2020 if decoded as code
memory.set([0xea, 0xea], 0x6400); // NOP NOP
memory.set([...Buffer.from("HELLO, WORLD")], 0x6402);
memory.set([0x00, 0x10, 0x00, 0x20, 0x00, 0x30, 0x00, 0x40], 0x640e);
memory[0x6416] = 0x60; // RTS

const range = (from: number, to: number) =>
	disassembleRange({ readByte: (a) => memory[a] ?? 0, scope: "main", fromAddress: from, toAddress: to });

describe("disassembleRange over data blocks", () => {
	it("skips the whole .db block instead of decoding its bytes as code", async () => {
		const lines = await range(0x6300, 0x63ff);
		expect(lines.map((l) => l.addr)).toEqual([0x6300]);
		expect(lines[0]!.size).toBe(256);
	});

	it.each([
		[".STR", 0x6402, 0x640d],
		[".WORD", 0x640e, 0x6415],
	])("ends a range covering exactly a %s block whose displayed bytes are shortened", async (opc, from, to) => {
		const lines = await range(from, to);
		expect(lines.map((l) => [l.addr, l.opc.split(" ")[0]])).toEqual([[from, opc]]);
	});

	it("follows code and data blocks across a range", async () => {
		const lines = await range(0x6300, 0x6416);
		expect(lines.map((l) => [l.addr, l.opc.split(" ")[0]])).toEqual([
			[0x6300, ".BYTE"],
			[0x6400, "NOP"],
			[0x6401, "NOP"],
			[0x6402, ".STR"],
			[0x640e, ".WORD"],
			[0x6416, "RTS"],
		]);
	});
});
