import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, shallowRef } from "vue";
import {
	clearInstructionTrace,
	readInstructionTrace,
	recordInstruction,
	setInstructionTrace,
	type TraceSnapshot,
} from "@/virtualmachine/cpu/instructionTrace";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

const memory = new Uint8Array(0x20000);
memory.set([0x20, 0xed, 0xfd], 0x300); // $0300 START: JSR COUT
memory.set([0xa9, 0xc1], 0xfded); // $FDED COUT: LDA #$C1

// The worker side, run in-process: the real ring buffer.
const vm = {
	ready: Promise.resolve(),
	sharedRegisters: new DataView(new ArrayBuffer(64)),
	getScope: () => "main",
	readDebug: (a: number) => memory[a] ?? 0,
	setInstructionTrace: vi.fn(async (enabled: boolean, size?: number): Promise<TraceSnapshot> => {
		setInstructionTrace(enabled, size);
		return readInstructionTrace(0);
	}),
	getInstructionTrace: vi.fn(async (count?: number) => readInstructionTrace(count)),
};

const LABELS: Record<number, string> = { 0x300: "START", 0xfded: "COUT" };
vi.mock("@/composables/useMachine", () => ({ useMachine: () => ({ vm: shallowRef(vm), isRunning: ref(false) }) }));
vi.mock("@/composables/useCommands", () => ({ useCommands: () => ({}) }));
vi.mock("@/composables/useSymbols", () => ({
	useSymbols: () => ({
		getAddressForLabel: () => undefined,
		getSymbolForAddress: (addr: number) => (LABELS[addr] ? { label: LABELS[addr], src: "" } : undefined),
		getLabelForAddress: (addr: number) => LABELS[addr],
		findSymbolWithOffset: (addr: number) =>
			LABELS[addr] ? { symbol: { label: LABELS[addr] }, offset: 0 } : undefined,
		addManySymbols: vi.fn(),
	}),
}));
vi.mock("@/composables/useComments", () => ({ useComments: () => ({ getBothComments: () => ["", ""] }) }));
vi.mock("@/composables/useDataFormattings", () => ({ useFormatting: () => ({ getFormat: () => undefined }) }));

const { findTool } = await import("@/lib/mcp/tools");
const call = (input: Record<string, unknown> = {}) =>
	findTool("get_trace")!
		.execute(input, {})
		.then((r) => JSON.parse(r as string));

describe("get_trace tool", () => {
	beforeEach(() => {
		setInstructionTrace(false);
		clearInstructionTrace();
		vi.clearAllMocks();
	});

	it("enable starts recording, cleared, with the requested size", async () => {
		expect(await call({ enable: true, size: 100 })).toMatchObject({ recording: true, capacity: 128, recorded: 0 });
		expect(vm.setInstructionTrace).toHaveBeenCalledWith(true, 100);
	});

	it("returns the last instructions, disassembled, with the registers before each", async () => {
		await call({ enable: true });
		recordInstruction(0x300, 0x00, 0x01, 0x02, 0x24, 0xff);
		recordInstruction(0xfded, 0x00, 0x01, 0x02, 0x24, 0xfd);
		const result = await call();
		expect(result).toMatchObject({ recording: true, capacity: 4096, recorded: 2 });
		expect(result.entries).toEqual([
			{ address: "$0300", label: "START", instruction: "JSR COUT", regs: "A=00 X=01 Y=02 P=24 SP=FF" },
			{ address: "$FDED", label: "COUT", instruction: "LDA #$C1", regs: "A=00 X=01 Y=02 P=24 SP=FD" },
		]);
	});

	it("`count` limits to the last ones; enable: false stops and keeps them", async () => {
		await call({ enable: true });
		for (let i = 0; i < 5; i++) recordInstruction(0x300, i, 0, 0, 0, 0);
		const last = await call({ count: 2, enable: false });
		expect(last).toMatchObject({ recording: false, recorded: 5 });
		expect(last.entries.map((e: { regs: string }) => e.regs.slice(0, 4))).toEqual(["A=03", "A=04"]);
		expect(vm.getInstructionTrace).toHaveBeenLastCalledWith(2);
	});

	it("says how to start when nothing was recorded", async () => {
		const result = await call();
		expect(result).toMatchObject({ recording: false, recorded: 0, entries: [] });
		expect(result.note).toMatch(/enable: true/);
	});

	it("rejects bad input", async () => {
		await expect(call({ count: 0 })).rejects.toThrow(/count/);
		await expect(call({ enable: "yes" })).rejects.toThrow(/enable/);
		await expect(call({ enable: true, size: 70000 })).rejects.toThrow(/size/);
	});
});
