import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

const { useBreakpoints } = await import("@/composables/useBreakpoints");

describe("findHitBreakpoints: which breakpoint the worker stopped on", () => {
	const { addBreakpoint, toggleBreakpointEnable, findHitBreakpoints, loadBreakpoints } = useBreakpoints();
	const hit = (type: string, address: number) =>
		findHitBreakpoints(type, address).map((bp) => `${bp.type} ${bp.address.toString(16)}-${bp.endAddress?.toString(16) ?? ""}`);

	beforeEach(() => loadBreakpoints()); // empty store

	it("finds a PC breakpoint at the exact address only", () => {
		addBreakpoint({ type: "pc", address: 0x300, command: "regs;run" });
		expect(findHitBreakpoints("pc", 0x300)[0]?.command).toBe("regs;run");
		expect(hit("pc", 0x301)).toEqual([]);
		expect(hit("read", 0x300)).toEqual([]);
	});

	it("finds a range breakpoint from any byte inside it", () => {
		addBreakpoint({ type: "write", address: 0x400, endAddress: 0x7ff, command: "log w;run" });
		expect(findHitBreakpoints("write", 0x5a3)[0]?.command).toBe("log w;run");
		expect(hit("write", 0x7ff)).toHaveLength(1);
		expect(hit("write", 0x800)).toEqual([]);
		expect(hit("read", 0x500)).toEqual([]);
	});

	it("an access breakpoint answers both read and write hits", () => {
		addBreakpoint({ type: "access", address: 0xc000, command: "x" });
		expect(hit("read", 0xc000)).toEqual(["access c000-"]);
		expect(hit("write", 0xc000)).toEqual(["access c000-"]);
		expect(hit("pc", 0xc000)).toEqual([]);
	});

	it("matches the physical address, bank included", () => {
		addBreakpoint({ type: "read", address: 0x10400, endAddress: 0x107ff });
		expect(hit("read", 0x10500)).toHaveLength(1);
		expect(hit("read", 0x00500)).toEqual([]);
	});

	it("most specific first: same type before access, then the narrowest range", () => {
		addBreakpoint({ type: "access", address: 0x400, endAddress: 0x7ff });
		addBreakpoint({ type: "write", address: 0x400, endAddress: 0x7ff });
		addBreakpoint({ type: "write", address: 0x500 });
		addBreakpoint({ type: "access", address: 0x500 });
		expect(hit("write", 0x500)).toEqual(["write 500-", "write 400-7ff", "access 500-", "access 400-7ff"]);
	});

	it("ignores disabled breakpoints", () => {
		addBreakpoint({ type: "write", address: 0x400, endAddress: 0x7ff });
		toggleBreakpointEnable({ type: "write", address: 0x400, endAddress: 0x7ff });
		expect(hit("write", 0x500)).toEqual([]);
	});
});
