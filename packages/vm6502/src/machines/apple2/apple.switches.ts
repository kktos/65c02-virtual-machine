import type { AppleBus } from "./apple.bus";
import * as SoftSwitches from "./softswitches";

export function installSoftSwitches(bus: AppleBus) {
	// --- Keyboard ---
	bus.onRead(SoftSwitches.KBD, () => bus.lastKey | (bus.keyStrobe ? 0x80 : 0x00));
	bus.onRead(SoftSwitches.KBDSTRB, () => {
		bus.keyStrobe = false;
		return 0;
	});
	bus.onWrite(SoftSwitches.KBDSTRB, () => {
		bus.keyStrobe = false;
	});

	// --- Video State Reads ---
	bus.onRead(SoftSwitches.STORE80, () => (bus.store80 ? 0x80 : 0x00));
	bus.onRead(SoftSwitches.COL80, () => (bus.col80 ? 0x80 : 0x00));
	bus.onRead(SoftSwitches.ALTCHARSET, () => (bus.altChar ? 0x80 : 0x00));
	bus.onRead(SoftSwitches.TEXT, () => (bus.text ? 0x80 : 0x00));
	bus.onRead(SoftSwitches.MIXED, () => (bus.mixed ? 0x80 : 0x00));
	bus.onRead(SoftSwitches.PAGE2, () => (bus.page2 ? 0x80 : 0x00));
	bus.onRead(SoftSwitches.HIRES, () => (bus.hires ? 0x80 : 0x00));
	bus.onRead(SoftSwitches.TBCOLOR, () => bus.tbColor);

	// --- Video State Writes ---
	bus.onWrite(SoftSwitches.STORE80OFF, () => {
		bus.store80 = false;
	});
	bus.onWrite(SoftSwitches.STORE80ON, () => {
		bus.store80 = true;
	});
	bus.onWrite(SoftSwitches.COL80OFF, () => {
		bus.col80 = false;
	});
	bus.onWrite(SoftSwitches.COL80ON, () => {
		bus.col80 = true;
	});
	bus.onWrite(SoftSwitches.ALTCHARSETOFF, () => {
		bus.altChar = false;
	});
	bus.onWrite(SoftSwitches.ALTCHARSETON, () => {
		bus.altChar = true;
	});
	bus.onWrite(SoftSwitches.TEXTOFF, () => {
		bus.text = false;
	});
	bus.onWrite(SoftSwitches.TEXTON, () => {
		bus.text = true;
	});
	bus.onWrite(SoftSwitches.MIXEDOFF, () => {
		bus.mixed = false;
	});
	bus.onWrite(SoftSwitches.MIXEDON, () => {
		bus.mixed = true;
	});
	bus.onWrite(SoftSwitches.PAGE2OFF, () => {
		bus.page2 = false;
	});
	bus.onWrite(SoftSwitches.PAGE2ON, () => {
		bus.page2 = true;
	});
	bus.onWrite(SoftSwitches.HIRESOFF, () => {
		bus.hires = false;
	});
	bus.onWrite(SoftSwitches.HIRESON, () => {
		bus.hires = true;
	});
	bus.onWrite(SoftSwitches.TBCOLOR, (v) => {
		bus.tbColor = v;
	});

	// Read-only switches that trigger state changes
	bus.onRead(SoftSwitches.PAGE2OFF, () => {
		bus.page2 = false;
		return 0;
	});
	bus.onRead(SoftSwitches.PAGE2ON, () => {
		bus.page2 = true;
		return 0;
	});
	bus.onRead(SoftSwitches.HIRESOFF, () => {
		bus.hires = false;
		return 0;
	});
	bus.onRead(SoftSwitches.TEXTON, () => {
		bus.text = true;
		return 0;
	});

	// --- Memory Management ---
	bus.onRead(SoftSwitches.RAMRD, () => (bus.ramRdAux ? 0x80 : 0x00));
	bus.onRead(SoftSwitches.RAMWRT, () => (bus.ramWrAux ? 0x80 : 0x00));
	bus.onRead(SoftSwitches.ALTZP, () => (bus.altZp ? 0x80 : 0x00));
	bus.onRead(SoftSwitches.INTCXROM, () => (bus.intCxRom ? 0x80 : 0x00));
	bus.onRead(SoftSwitches.SLOTC3ROM, () => (bus.slotC3Rom ? 0x80 : 0x00));
	bus.onRead(SoftSwitches.RDLCBNK2, () => (bus.lcBank2 ? 0x80 : 0x00));
	bus.onRead(SoftSwitches.RDLCRAM, () => (bus.lcReadRam ? 0x80 : 0x00));

	bus.onWrite(SoftSwitches.RAMRDOFF, () => {
		bus.ramRdAux = false;
	});
	bus.onWrite(SoftSwitches.RAMRDON, () => {
		bus.ramRdAux = true;
	});
	bus.onWrite(SoftSwitches.RAMWRTOFF, () => {
		bus.ramWrAux = false;
	});
	bus.onWrite(SoftSwitches.RAMWRTON, () => {
		bus.ramWrAux = true;
	});
	bus.onWrite(SoftSwitches.ALTZPOFF, () => {
		bus.altZp = false;
	});
	bus.onWrite(SoftSwitches.ALTZPON, () => {
		bus.altZp = true;
	});
	bus.onWrite(SoftSwitches.INTCXROMOFF, () => {
		bus.intCxRom = false;
	});
	bus.onWrite(SoftSwitches.INTCXROMON, () => {
		bus.intCxRom = true;
	});
	bus.onWrite(SoftSwitches.SLOTC3ROMOFF, () => {
		bus.slotC3Rom = false;
	});
	bus.onWrite(SoftSwitches.SLOTC3ROMON, () => {
		bus.slotC3Rom = true;
	});

	// --- Game I/O ---
	bus.onRead(SoftSwitches.PB0, () => (bus.pb0 ? 0x80 : 0x00));
	bus.onRead(SoftSwitches.PB1, () => (bus.pb1 ? 0x80 : 0x00));

	// --- Language Card ($C080-$C08F) ---
	for (let addr = 0xc080; addr <= 0xc08f; addr++) {
		bus.onRead(addr, () => {
			updateLcState(bus, addr);
			return 0;
		});
		bus.onWrite(addr, () => updateLcState(bus, addr));
	}

	// --- Slot I/O ($C090-$C0FF) ---
	for (let addr = 0xc090; addr <= 0xc0ff; addr++) {
		const slot = ((addr >> 4) & 0x0f) - 8;
		const offset = addr & 0x0f;
		bus.onRead(addr, () => bus.slots[slot]?.readIo(offset) ?? 0);
		bus.onWrite(addr, (v) => bus.slots[slot]?.writeIo(offset, v));
	}
}

function updateLcState(bus: AppleBus, address: number) {
	const bit0 = (address & 1) !== 0; // 0=Read RAM/ROM, 1=Write RAM (maybe)
	const bit1 = (address & 2) !== 0; // 0=Read RAM/ROM, 1=Read ROM
	const bit3 = (address & 8) !== 0; // 0=Bank 2, 1=Bank 1

	bus.lcBank2 = !bit3;
	bus.lcReadRam = bit0 === bit1;

	// Write Enable Logic:
	if (!bit0) {
		bus.lcWriteRam = false;
		bus.lcPreWriteCount = 0;
	} else {
		bus.lcPreWriteCount++;
		if (bus.lcPreWriteCount > 1) {
			bus.lcWriteRam = true;
			bus.lcPreWriteCount = 0;
		}
	}
}
