import { describe, expect, it, vi } from "vitest";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

const LABELS: Record<string, number> = { KEYIN: 0xfd1b };
vi.mock("@/composables/useSymbols", () => ({
	useSymbols: () => ({ getAddressForLabel: (label: string) => LABELS[label.toUpperCase()] }),
}));

// The real disassembler pulls in the whole command registry.
vi.mock("@/lib/mini-monitor/disassembly.cmd", () => ({
	runDisassembly: async (start: number) => ({ content: `disasm ${start.toString(16)}`, endAddr: start + 1 }),
}));

const { minimonitor } = await import("@/lib/mini-monitor/mini-monitor");

const vm = {
	read: (addr: number) => addr & 0xff,
	readDebug: (addr: number) => addr & 0xff,
	readDebugRange: (addr: number, len: number) => Uint8Array.from({ length: len }, (_, i) => (addr + i) & 0xff),
	writeDebug: vi.fn(),
	sharedRegisters: new DataView(new ArrayBuffer(16)),
} as unknown as VirtualMachine;

const run = async (line: string) => {
	const out = await minimonitor(line, vm);
	return "content" in out ? out.content : out;
};

describe("mini-monitor", () => {
	it("rejects unknown words instead of hex-dumping (`bogus` = $B + `ogus`)", async () => {
		await expect(minimonitor("bogus", vm)).rejects.toThrow("Unknown command: bogus");
		await expect(minimonitor("xyz", vm)).rejects.toThrow("Unknown command: xyz");
		await expect(minimonitor("300 foo", vm)).rejects.toThrow("Unknown command: 300 foo");
		await expect(minimonitor("300L extra", vm)).rejects.toThrow("Unknown command");
	});

	it("still hex-dumps addresses, ranges, registers and labels", async () => {
		expect(await run("300")).toBe("$00/0300: 00");
		expect(await run("300.303")).toContain("00 01 02 03");
		expect(await run("pc")).toBe("$00/0000: 00");
		expect(await run("KEYIN")).toBe("$00/FD1B: 1B");
	});

	it("still recognises G and L (alone or after an address)", async () => {
		expect(await run("300L")).toBe("disasm 300");
		expect(await run("L")).toBe("disasm 301");
		expect(await run("fc58G")).toEqual({ type: "JSR", address: 0xfc58 });
		expect(await run("300 g")).toEqual({ type: "JSR", address: 0x300 });
	});
});
