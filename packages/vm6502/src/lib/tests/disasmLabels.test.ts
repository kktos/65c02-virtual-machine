import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/composables/useComments", () => ({ useComments: () => ({ getBothComments: () => ["", ""] }) }));
vi.mock("@/composables/useDataFormattings", () => ({ useFormatting: () => ({ getFormat: () => undefined }) }));

globalThis.indexedDB = new IDBFactory();

const { parseLabelsLine, parseSymbolsText, useSymbols } = await import("@/composables/useSymbols");
const { disassemble } = await import("@/lib/disassembler");

describe("LABELS lines", () => {
	it("parses labels, sized labels and attribute ranges", () => {
		expect(parseLabelsLine("$0100 STACK")).toEqual({ label: "STACK", start: 0x100, end: undefined, flags: [] });
		expect(parseLabelsLine("  $0200:$02ff  INPUTBUF ; the input buffer")).toEqual({
			label: "INPUTBUF",
			start: 0x200,
			end: 0x2ff,
			flags: [],
		});
		expect(parseLabelsLine("$c080:$c0ff [noindex]")).toEqual({
			label: undefined,
			start: 0xc080,
			end: 0xc0ff,
			flags: ["noindex"],
		});
		expect(parseLabelsLine("c080 [NoIndex]")).toEqual({
			label: undefined,
			start: 0xc080,
			end: undefined,
			flags: ["noindex"],
		});
	});

	it("rejects invalid lines", () => {
		expect(parseLabelsLine("$0100")).toMatch(/no label nor flag/);
		expect(parseLabelsLine("$0200:$0100 X")).toMatch(/end is before the start/);
		expect(parseLabelsLine("$c080:$c0ff [nope]")).toMatch(/unknown flag "nope"/);
		expect(parseLabelsLine("STACK $0100")).toMatch(/invalid line/);
	});

	it("imports sized labels and leaves the attribute ranges out", () => {
		const text = "LABELS sys\n  $0200:$02FF INPUTBUF\n  $07F8:$07F8 MSLOT\n  $C080:$C0FF [noindex]\nEND_LABELS";
		expect(parseSymbolsText(text)).toEqual([
			{ ns: "sys", scope: "main", label: "INPUTBUF", addr: 0x200, src: "", size: 0x100 },
			{ ns: "sys", scope: "main", label: "MSLOT", addr: 0x7f8, src: "", size: 1 },
		]);
	});
});

describe("disassembler operands", () => {
	const memory = new Uint8Array(0x10000);
	const symbols = useSymbols();

	beforeAll(async () => {
		await symbols.initSymbols("Test Machine");
		symbols.setScopeSearchPath(["main", "io"]);
		await symbols.addManySymbols([
			{ ns: "sys", scope: "main", label: "SPOT", addr: 0x50 },
			{ ns: "sys", scope: "main", label: "STACK", addr: 0x100, size: 0x100 },
			{ ns: "sys", scope: "main", label: "INPUTBUF", addr: 0x200, size: 0x100 },
			{ ns: "sys", scope: "main", label: "MSLOT", addr: 0x7f8 },
			{ ns: "sys", scope: "io", label: "KBD", addr: 0xc000 },
			{ ns: "sys", scope: "io", label: "PAGE1", addr: 0xc054 },
			{ ns: "sys", scope: "io", label: "LCBANK2_RW", addr: 0xc080 },
			{ ns: "sys", scope: "io", label: "LCBANK1_R", addr: 0xc08b },
		]);
		symbols.addAddressRanges([{ ns: "slots", scope: "io", start: 0xc080, end: 0xc0ff, flags: ["noindex"] }]);
	});

	const operandOf = async (...bytes: number[]) => {
		memory.set(bytes, 0x1000);
		const [line] = await disassemble({
			readByte: (address: number) => memory[address & 0xffff] ?? 0,
			scope: "main",
			fromAddress: 0x1000,
			lineCount: 1,
		});
		return line!.opr;
	};

	it("never uses a label after the address (no negative offset)", async () => {
		expect(await operandOf(0x86, 0xff)).toBe("$FF"); // STX $FF, was STACK+-1
		expect(await operandOf(0xad, 0xff, 0xbf)).toBe("$BFFF"); // was KBD-1
		expect(await operandOf(0xad, 0xfa, 0xbf)).toBe("$BFFA"); // was KBD-6
		expect(await operandOf(0xad, 0xe4, 0x07)).toBe("$07E4"); // was MSLOT-20
	});

	it("writes the offset in hex", async () => {
		expect(await operandOf(0xa5, 0x53)).toBe("SPOT+$03");
		expect(await operandOf(0xad, 0x0c, 0x02)).toBe("INPUTBUF+$0C");
		expect(await operandOf(0xad, 0xfa, 0x07)).toBe("MSLOT+$02");
	});

	it("keeps an offset inside the size of the label", async () => {
		expect(await operandOf(0xad, 0x80, 0x02)).toBe("INPUTBUF+$80"); // beyond the lookback window
		expect(await operandOf(0xad, 0xff, 0x02)).toBe("INPUTBUF+$FF");
		expect(await operandOf(0xad, 0x00, 0x03)).toBe("$0300");
	});

	it("gives no label to an indexed operand in a [noindex] range", async () => {
		expect(await operandOf(0xbd, 0x8c, 0xc0)).toBe("$C08C,X"); // was LCBANK1_R+1,X
		expect(await operandOf(0xbd, 0x80, 0xc0)).toBe("$C080,X");
		expect(await operandOf(0xb9, 0x80, 0xc0)).toBe("$C080,Y");
		expect(await operandOf(0xad, 0x80, 0xc0)).toBe("LCBANK2_RW");
		expect(await operandOf(0x9d, 0x54, 0xc0)).toBe("PAGE1,X");
	});

	it("drops the range rule with its namespace", async () => {
		symbols.toggleNamespace("slots");
		expect(await operandOf(0xbd, 0x80, 0xc0)).toBe("LCBANK2_RW,X");
		symbols.toggleNamespace("slots");
		expect(await operandOf(0xbd, 0x80, 0xc0)).toBe("$C080,X");
	});
});
