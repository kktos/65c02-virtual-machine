import { describe, expect, it, vi } from "vitest";

// The memory's annotations, which a disk's bytes must not get: a format, a comment, a label at $0300 / $FDED
vi.mock("@/composables/useComments", () => ({
	useComments: () => ({ getBothComments: (a: number) => (a === 0x300 ? ["a RAM comment", ""] : ["", ""]) }),
}));
vi.mock("@/composables/useDataFormattings", () => ({
	useFormatting: () => ({ getFormat: (a: number) => (a === 0x300 ? { type: "byte", length: 16 } : undefined) }),
}));
const LABELS: Record<number, string> = { 0x300: "START", 0xfded: "COUT" };
vi.mock("@/composables/useSymbols", () => ({
	useSymbols: () => ({
		getSymbolForAddress: (a: number) => (LABELS[a] ? { label: LABELS[a], src: "" } : undefined),
		getLabelForAddress: (a: number) => LABELS[a],
		findSymbolWithOffset: (a: number) => (LABELS[a] ? { symbol: { label: LABELS[a] }, offset: 0 } : undefined),
		addManySymbols: vi.fn(),
		hasRangeFlag: () => false,
	}),
}));

const { disassembleBytes } = await import("@/lib/disk/disasmBytes");

// $0300: LDA #$C1 / JSR COUT / BNE $0300 / BRK $00 / JMP $0300 / JMP $1234 / LDA $12 (cut: 1 byte of 2)
const code = new Uint8Array([
	0xa9, 0xc1, 0x20, 0xed, 0xfd, 0xd0, 0xf9, 0x00, 0x00, 0x4c, 0x00, 0x03, 0x4c, 0x34, 0x12, 0xa5,
]);

describe("disassembleBytes", () => {
	it("decodes at the origin, without the memory's formats, comments, hypercalls", async () => {
		const lines = await disassembleBytes(code, 0x300);
		expect(lines.map((l) => [l.addr, l.opc, l.opr])).toEqual([
			[0x300, "LDA", "#$C1"],
			[0x302, "JSR", "COUT"],
			[0x305, "BNE", "START"],
			[0x307, "BRK", ""],
			[0x308, "BRK", ""],
			[0x309, "JMP", "START"],
			[0x30c, "JMP", "$1234"],
			[0x30f, ".DB", "$A5"],
		]);
		expect(lines[0]!.label).toBe("START");
		expect(lines.every((l) => !l.comment)).toBe(true);
	});

	it("knows the jumps landing in the bytes", async () => {
		const lines = await disassembleBytes(code, 0x300);
		expect(lines.filter((l) => l.target !== undefined).map((l) => [l.addr, l.target])).toEqual([
			[0x305, 0x300],
			[0x309, 0x300],
		]);
	});

	it("without labels: addresses only", async () => {
		const lines = await disassembleBytes(code, 0x300, { labels: false });
		expect(lines[0]!.label).toBe("");
		expect(lines.slice(1, 3).map((l) => l.opr)).toEqual(["$FDED", "$0300"]);
	});

	it("cuts the last instruction short as data", async () => {
		const lines = await disassembleBytes(new Uint8Array([0xea, 0x20, 0x00]), 0x800);
		expect(lines.map((l) => [l.opc, l.bytes, l.size])).toEqual([
			["NOP", "EA", 1],
			[".DB", "20 00", 2],
		]);
	});
});

describe("disassembleBytes, code starting after data", () => {
	it("shows the bytes before the start as data (a boot sector's count)", async () => {
		const lines = await disassembleBytes(new Uint8Array([0x01, 0xa9, 0x60, 0x60]), 0x800, { start: 0x801 });
		expect(lines.map((l) => [l.addr, l.opc, l.opr])).toEqual([
			[0x800, ".DB", "$01"],
			[0x801, "LDA", "#$60"],
			[0x803, "RTS", ""],
		]);
	});
});
