import { describe, expect, it, vi } from "vitest";
import { ref, shallowRef } from "vue";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

const memory = new Uint8Array(0x20000);
const program: [number, number[]][] = [
	[0x300, [0xa9, 0xc1]], // START: LDA #$C1   ; init
	[0x302, [0x20, 0xed, 0xfd]], // JSR COUT
	[0x305, [0xca]], // LOOP: DEX
	[0x306, [0xd0, 0xfd]], // BNE LOOP
	[0x308, [0x60]], // RTS
	[0x309, [0x8d, 0x00, 0xc0]], // STA $C000
];
for (const [address, bytes] of program) memory.set(bytes, address);
for (let i = 0; i < 20; i++) memory[0x310 + i] = i; // $0310: 20-byte .BYTE block
memory[0x324] = 0xea; // NOP

const vm = {
	ready: Promise.resolve(),
	sharedRegisters: new DataView(new ArrayBuffer(64)),
	syncBusState: vi.fn(),
	getScope: () => "main",
	readDebug: (address: number) => memory[address] ?? 0,
	readDebugRange: (address: number, length: number) => memory.slice(address, address + length),
};

const LABELS: Record<number, string> = { 0x300: "START", 0x305: "LOOP", 0xfded: "COUT" };

vi.mock("@/composables/useMachine", () => ({ useMachine: () => ({ vm: shallowRef(vm), isRunning: ref(false) }) }));
vi.mock("@/composables/useCommands", () => ({ useCommands: () => ({}) }));
vi.mock("@/composables/useSymbols", () => ({
	useSymbols: () => ({
		getAddressForLabel: (name: string) => Number(Object.entries(LABELS).find(([, l]) => l === name)?.[0]),
		getSymbolForAddress: (addr: number) => (LABELS[addr] ? { label: LABELS[addr], src: "" } : undefined),
		getLabelForAddress: (addr: number) => LABELS[addr],
		findSymbolWithOffset: (addr: number) =>
			LABELS[addr] ? { symbol: { label: LABELS[addr] }, offset: 0 } : undefined,
		addManySymbols: vi.fn(),
	}),
}));
vi.mock("@/composables/useComments", () => ({
	useComments: () => ({ getBothComments: (addr: number) => (addr === 0x300 ? ["init", ""] : ["", ""]) }),
}));
vi.mock("@/composables/useDataFormattings", () => ({
	useFormatting: () => ({ getFormat: (addr: number) => (addr === 0x310 ? { type: "byte", length: 20 } : undefined) }),
}));

const { findTool } = await import("@/lib/mcp/tools");
const call = (input: Record<string, unknown>) =>
	findTool("disassemble")!
		.execute(input, {})
		.then((r) => JSON.parse(r));

describe("disassemble tool", () => {
	it("returns one entry per instruction, with labels, targets and comments", async () => {
		const result = await call({ address: "$300", count: 6 });
		expect(result.lines).toEqual([
			{ address: "$0300", bytes: "A9 C1", label: "START", instruction: "LDA #$C1", comment: "init" },
			{ address: "$0302", bytes: "20 ED FD", instruction: "JSR COUT", target: "$FDED" },
			{ address: "$0305", bytes: "CA", label: "LOOP", instruction: "DEX" },
			{ address: "$0306", bytes: "D0 FD", instruction: "BNE LOOP", target: "$0305" },
			{ address: "$0308", bytes: "60", instruction: "RTS" },
			{ address: "$0309", bytes: "8D 00 C0", instruction: "STA $C000" },
		]);
		expect(result).toMatchObject({ address: "$0300", end_address: "$FFFF", next_address: "$030C" });
		expect(vm.syncBusState).toHaveBeenCalled();
	});

	it("pages with next_address", async () => {
		const first = await call({ address: "START", count: 2 });
		expect(first.lines.map((l: { address: string }) => l.address)).toEqual(["$0300", "$0302"]);
		expect(first.next_address).toBe("$0305");
		const second = await call({ address: first.next_address, count: 2 });
		expect(second.lines.map((l: { address: string }) => l.address)).toEqual(["$0305", "$0306"]);
	});

	it("stops at end_address (an instruction starting there is included) and drops next_address", async () => {
		const result = await call({ address: 0x300, end_address: "$0306" });
		expect(result.lines.at(-1)).toMatchObject({ address: "$0306", instruction: "BNE LOOP" });
		expect(result.lines).toHaveLength(4);
		expect(result).not.toHaveProperty("next_address");
	});

	it("stops at the end of the bank by default", async () => {
		const result = await call({ address: "$FFFE", count: 10 });
		expect(result.lines.map((l: { address: string }) => l.address)).toEqual(["$FFFE", "$FFFF"]);
		expect(result).not.toHaveProperty("next_address");
	});

	it("shows data blocks with their real length", async () => {
		const result = await call({ address: "$310", count: 2 });
		expect(result.lines[0].instruction).toMatch(/^\.BYTE \$00, \$01/);
		expect(result.lines[0].bytes).toBe("00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F ... (20 bytes)");
		expect(result.lines[1]).toMatchObject({ address: "$0324", instruction: "NOP" });
	});

	it("puts each line on one line of output", async () => {
		const text = await findTool("disassemble")!.execute({ address: 0x300, count: 3 }, {});
		expect(text.split("\n").filter((l) => l.includes('"instruction"'))).toHaveLength(3);
	});

	it("rejects bad input", async () => {
		await expect(call({ address: 0x300, count: 0 })).rejects.toThrow(/count/);
		await expect(call({ address: 0x300, count: 257 })).rejects.toThrow(/count/);
		await expect(call({ address: 0x300, end_address: 0x2ff })).rejects.toThrow(/end_address/);
	});
});
