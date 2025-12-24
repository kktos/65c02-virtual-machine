import type { AppleBus } from "../apple.bus";
import * as SoftSwitches from "./softswitches";

export function installSoftSwitches(bus: AppleBus) {
	const readHandlers: Array<() => number> = new Array(256);
	const writeHandlers: Array<(val: number) => void> = new Array(256);

	// Initialize with default no-op/error handlers
	readHandlers.fill(() => 0);
	writeHandlers.fill(() => {});

	const onRead = (address: number, handler: () => number) => {
		readHandlers[address & 0xff] = handler;
	};
	const onWrite = (address: number, handler: (val: number) => void) => {
		writeHandlers[address & 0xff] = handler;
	};
	// const onRW = (address: number, handler: () => number) => {
	// 	readHandlers[address & 0xff] = handler;
	// 	writeHandlers[address & 0xff] = handler;
	// };

	// --- Keyboard ---
	onRead(SoftSwitches.KBD, () => bus.lastKey | (bus.keyStrobe ? 0x80 : 0x00));
	onRead(SoftSwitches.KBDSTRB, () => {
		bus.keyStrobe = false;
		return 0;
	});
	onWrite(SoftSwitches.KBDSTRB, () => {
		bus.keyStrobe = false;
	});

	// --- Video State Reads ---
	onRead(SoftSwitches.STORE80, () => (bus.store80 ? 0x80 : 0x00));
	onRead(SoftSwitches.COL80, () => (bus.col80 ? 0x80 : 0x00));
	onRead(SoftSwitches.ALTCHARSET, () => (bus.altChar ? 0x80 : 0x00));
	onRead(SoftSwitches.TEXT, () => (bus.text ? 0x80 : 0x00));
	onRead(SoftSwitches.MIXED, () => (bus.mixed ? 0x80 : 0x00));
	onRead(SoftSwitches.PAGE2, () => (bus.page2 ? 0x80 : 0x00));
	onRead(SoftSwitches.HIRES, () => (bus.hires ? 0x80 : 0x00));
	onRead(SoftSwitches.TBCOLOR, () => bus.tbColor);

	// --- Video State Writes ---
	onWrite(SoftSwitches.STORE80OFF, () => {
		bus.store80 = false;
	});
	onWrite(SoftSwitches.STORE80ON, () => {
		bus.store80 = true;
	});
	onWrite(SoftSwitches.COL80OFF, () => {
		bus.col80 = false;
	});
	onWrite(SoftSwitches.COL80ON, () => {
		bus.col80 = true;
	});
	onWrite(SoftSwitches.ALTCHARSETOFF, () => {
		bus.altChar = false;
	});
	onWrite(SoftSwitches.ALTCHARSETON, () => {
		bus.altChar = true;
	});
	onWrite(SoftSwitches.TEXTOFF, () => {
		bus.text = false;
	});
	onWrite(SoftSwitches.TEXTON, () => {
		bus.text = true;
	});
	onWrite(SoftSwitches.MIXEDOFF, () => {
		bus.mixed = false;
	});
	onWrite(SoftSwitches.MIXEDON, () => {
		bus.mixed = true;
	});
	onWrite(SoftSwitches.PAGE2OFF, () => {
		bus.page2 = false;
	});
	onWrite(SoftSwitches.PAGE2ON, () => {
		bus.page2 = true;
	});
	onWrite(SoftSwitches.HIRESOFF, () => {
		bus.hires = false;
	});
	onWrite(SoftSwitches.HIRESON, () => {
		bus.hires = true;
	});
	onWrite(SoftSwitches.TBCOLOR, (v) => {
		bus.tbColor = v;
	});

	// Read-only switches that trigger state changes
	onRead(SoftSwitches.PAGE2OFF, () => {
		bus.page2 = false;
		return 0;
	});
	onRead(SoftSwitches.PAGE2ON, () => {
		bus.page2 = true;
		return 0;
	});
	onRead(SoftSwitches.HIRESOFF, () => {
		bus.hires = false;
		return 0;
	});
	onRead(SoftSwitches.HIRESON, () => {
		bus.hires = true;
		return 0;
	});
	onRead(SoftSwitches.TEXTON, () => {
		bus.text = true;
		return 0;
	});
	onRead(SoftSwitches.TEXTOFF, () => {
		bus.text = false;
		return 0;
	});

	// --- Memory Management ---
	onRead(SoftSwitches.RAMRD, () => (bus.ramRdAux ? 0x80 : 0x00));
	onRead(SoftSwitches.RAMWRT, () => (bus.ramWrAux ? 0x80 : 0x00));
	onRead(SoftSwitches.ALTZP, () => (bus.altZp ? 0x80 : 0x00));
	onRead(SoftSwitches.INTCXROM, () => (bus.intCxRom ? 0x80 : 0x00));
	onRead(SoftSwitches.SLOTC3ROM, () => (bus.slotC3Rom ? 0x80 : 0x00));
	onRead(SoftSwitches.RDLCBNK2, () => (bus.lcBank2 ? 0x80 : 0x00));
	onRead(SoftSwitches.RDLCRAM, () => (bus.lcReadRam ? 0x80 : 0x00));

	onWrite(SoftSwitches.RAMRDOFF, () => {
		bus.ramRdAux = false;
	});
	onWrite(SoftSwitches.RAMRDON, () => {
		bus.ramRdAux = true;
	});
	onWrite(SoftSwitches.RAMWRTOFF, () => {
		bus.ramWrAux = false;
	});
	onWrite(SoftSwitches.RAMWRTON, () => {
		bus.ramWrAux = true;
	});
	onWrite(SoftSwitches.ALTZPOFF, () => {
		bus.altZp = false;
	});
	onWrite(SoftSwitches.ALTZPON, () => {
		bus.altZp = true;
	});
	onWrite(SoftSwitches.INTCXROMOFF, () => {
		bus.intCxRom = false;
	});
	onWrite(SoftSwitches.INTCXROMON, () => {
		bus.intCxRom = true;
	});
	onWrite(SoftSwitches.SLOTC3ROMOFF, () => {
		bus.slotC3Rom = false;
	});
	onWrite(SoftSwitches.SLOTC3ROMON, () => {
		bus.slotC3Rom = true;
	});

	// --- Game I/O ---
	onRead(SoftSwitches.PB0, () => (bus.pb0 ? 0x80 : 0x00));
	onRead(SoftSwitches.PB1, () => (bus.pb1 ? 0x80 : 0x00));

	// --- Language Card ($C080-$C08F) ---
	for (let addr = 0xc080; addr <= 0xc08f; addr++) {
		onRead(addr, () => {
			updateLcState(bus, addr);
			return 0;
		});
		onWrite(addr, () => updateLcState(bus, addr));
	}

	// --- Slot I/O ($C090-$C0FF) ---
	for (let addr = 0xc090; addr <= 0xc0ff; addr++) {
		const slot = ((addr >> 4) & 0x0f) - 8;
		const offset = addr & 0x0f;
		onRead(addr, () => bus.slots[slot]?.readIo(offset) ?? 0);
		onWrite(addr, (v) => bus.slots[slot]?.writeIo(offset, v));
	}

	return { readHandlers, writeHandlers };
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
