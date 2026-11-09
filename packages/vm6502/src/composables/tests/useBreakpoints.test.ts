import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

const { useBreakpoints } = await import("@/composables/useBreakpoints");

describe("findHitBreakpoints: which breakpoint the worker stopped on", () => {
	const { addBreakpoint, toggleBreakpointEnable, findHitBreakpoints, loadBreakpoints } = useBreakpoints();
	const hit = (type: string, address: number) =>
		findHitBreakpoints(type, address).map(
			(bp) => `${bp.type} ${bp.address.toString(16)}-${bp.endAddress?.toString(16) ?? ""}`,
		);

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

describe("the worker keeps the flags of overlapping breakpoints", () => {
	const { addBreakpoint, removeBreakpoint, setBreakpointEnabled, loadBreakpoints } = useBreakpoints();
	const vm = { addBP: vi.fn(), removeBP: vi.fn() };
	const asVm = vm as unknown as Parameters<typeof addBreakpoint>[1];

	beforeEach(async () => {
		await loadBreakpoints();
		vi.clearAllMocks();
	});

	it("sets again the enabled ones overlapping a breakpoint removed or disabled", () => {
		addBreakpoint({ type: "access", address: 0x400, endAddress: 0x7ff }, asVm);
		addBreakpoint({ type: "read", address: 0x500 }, asVm);
		addBreakpoint({ type: "write", address: 0x900 }, asVm);
		vm.addBP.mockClear();

		setBreakpointEnabled({ type: "read", address: 0x500 }, false, asVm);
		expect(vm.removeBP).toHaveBeenCalledWith("read", 0x500, undefined);
		expect(vm.addBP.mock.calls).toEqual([["access", 0x400, 0x7ff]]);

		vm.addBP.mockClear();
		removeBreakpoint({ type: "access", address: 0x400, endAddress: 0x7ff }, asVm);
		expect(vm.addBP).not.toHaveBeenCalled(); // the read one is disabled, the write one elsewhere
	});

	it("reports whether the state changed", () => {
		addBreakpoint({ type: "pc", address: 0x300 }, asVm);
		expect(setBreakpointEnabled({ type: "pc", address: 0x300 }, true, asVm)).toBe(false);
		expect(setBreakpointEnabled({ type: "pc", address: 0x300 }, false, asVm)).toBe(true);
		expect(setBreakpointEnabled({ type: "pc", address: 0x301 }, false, asVm)).toBe(false);
	});
});

describe("takeHit: what a hit does to the breakpoints", () => {
	const { addBreakpoint, getBreakpoint, takeHit, loadBreakpoints } = useBreakpoints();

	beforeEach(() => loadBreakpoints());

	it("removes the temporary ones hit, and returns the most specific one", () => {
		addBreakpoint({ type: "pc", address: 0x300, isTemporary: true, command: "x" });
		expect(takeHit("pc", 0x300)?.command).toBe("x");
		expect(getBreakpoint({ type: "pc", address: 0x300 })).toBeUndefined();
	});

	it("turns off a once one only when it is the one deciding", () => {
		addBreakpoint({ type: "access", address: 0x400, endAddress: 0x7ff, once: true, command: "hook" });
		addBreakpoint({ type: "write", address: 0x500 });
		// The plain breakpoint at $500 decides: the hook in the range didn't fire.
		expect(takeHit("write", 0x500)?.type).toBe("write");
		expect(getBreakpoint({ type: "access", address: 0x400, endAddress: 0x7ff })?.enabled).toBe(true);

		expect(takeHit("read", 0x500)?.command).toBe("hook");
		expect(getBreakpoint({ type: "access", address: 0x400, endAddress: 0x7ff })).toMatchObject({
			enabled: false,
			once: true,
		});
	});
});
