// AppleBus.peek: the CPU's view of memory, for the disassembler, without the side effects of `read`.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppleBus } from "../apple.bus";
import { apple2e } from "../apple.machine";

describe("AppleBus.peek", () => {
	let bus: AppleBus;
	beforeEach(() => {
		vi.stubGlobal("self", { postMessage: () => undefined });
		vi.stubGlobal("performance", { now: () => 0 });
		// Like the main thread's bus: shared memory, no registers view.
		bus = new AppleBus(new Uint8Array(apple2e.memory.size));
	});

	it("doesn't trigger soft switches (`read` does)", () => {
		bus.keyStrobe = true;
		bus.peek(0xc010); // KBDSTRB
		expect(bus.keyStrobe).toBe(true);
		bus.read(0xc010);
		expect(bus.keyStrobe).toBe(false);
	});

	it("doesn't switch the expansion ROM on $CFFF or $C3xx (`read` does)", () => {
		bus.intC8Rom = true;
		bus.peek(0xcfff);
		expect(bus.intC8Rom).toBe(true);
		bus.read(0xcfff);
		expect(bus.intC8Rom).toBe(false);

		bus.slotC3Rom = true;
		bus.peek(0xc300);
		expect(bus.intC8Rom).toBe(false);
		bus.read(0xc300);
		expect(bus.intC8Rom).toBe(true);
	});

	it("follows the banking like the CPU (ALTZP, RAMRD); `readDebug` reads main", () => {
		bus.writeDebug(0x00fa, 0x11);
		bus.writeDebug(0x100fa, 0x22);
		bus.writeDebug(0x2000, 0x33);
		bus.writeDebug(0x12000, 0x44);

		expect([bus.peek(0xfa), bus.peek(0x2000)]).toEqual([0x11, 0x33]);
		bus.altZp = true;
		bus.ramRdAux = true;
		expect([bus.peek(0xfa), bus.peek(0x2000)]).toEqual([0x22, 0x44]);
		expect([bus.readDebug(0xfa), bus.readDebug(0x2000)]).toEqual([0x11, 0x33]);
	});

	it("reads banked addresses as physical", () => {
		bus.writeDebug(0x100fa, 0x22);
		expect(bus.peek(0x100fa)).toBe(0x22);
	});
});
