// AppleBus.peek: the CPU's view of memory, for the disassembler, without the side effects of `read`.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadDevices } from "@/virtualmachine/cpu/loaders/device.loader";
import type { LoadedDevice } from "@/types/machine.interface";
import { AppleBus } from "../apple.bus";
import { apple2e } from "../apple.machine";

let devices: LoadedDevice[] = [];
beforeAll(async () => {
	devices = await loadDevices(apple2e.devices);
});

describe("AppleBus.peek", () => {
	let bus: AppleBus;
	beforeEach(() => {
		vi.stubGlobal("self", { postMessage: () => undefined });
		vi.stubGlobal("performance", { now: () => 0 });
		// Like the main thread's bus: shared memory, no registers view.
		bus = new AppleBus(new Uint8Array(apple2e.memory.size));
		bus.installDevices(devices);
	});

	it("doesn't trigger soft switches (`read` does)", () => {
		bus.pressKey("A", "KeyA");
		bus.peek(0xc010); // KBDSTRB
		expect(bus.getKeyboardState().strobe).toBe(true);
		bus.read(0xc010);
		expect(bus.getKeyboardState().strobe).toBe(false);
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

	it("follows ALTZP in the language card, bank 2 and $E000-$FFFF; `readDebug` reads main", () => {
		bus.lcReadRam = true;
		bus.lcBank2 = true;
		bus.writeDebug(0xd1f9, 0x11);
		bus.writeDebug(0x1d1f9, 0x22);
		bus.writeDebug(0xe000, 0x33);
		bus.writeDebug(0x1e000, 0x44);

		expect([bus.peek(0xd1f9), bus.peek(0xe000)]).toEqual([0x11, 0x33]);
		bus.altZp = true;
		expect([bus.peek(0xd1f9), bus.peek(0xe000)]).toEqual([0x22, 0x44]);
		expect([bus.readDebug(0xd1f9), bus.readDebug(0xe000)]).toEqual([0x11, 0x33]);
	});

	it("follows 80STORE + PAGE2 on the text and hires pages, over RAMRD", () => {
		bus.writeDebug(0x0400, 0x11);
		bus.writeDebug(0x10400, 0x22);
		bus.writeDebug(0x2000, 0x33);
		bus.writeDebug(0x12000, 0x44);

		bus.store80 = true;
		bus.page2 = true;
		bus.hires = true;
		expect([bus.peek(0x0400), bus.peek(0x2000)]).toEqual([0x22, 0x44]);
		bus.page2 = false;
		bus.ramRdAux = true;
		expect([bus.peek(0x0400), bus.peek(0x2000)]).toEqual([0x11, 0x33]);
	});

	it("reads banked addresses as physical", () => {
		bus.writeDebug(0x100fa, 0x22);
		expect(bus.peek(0x100fa)).toBe(0x22);
	});
});
