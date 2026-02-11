import type { AppleBus } from "../apple.bus";
import * as SoftSwitches from "./softswitches";

// Cycles per paddle unit
const PADDLE_TIMEOUT_MULTIPLIER = 11.18;

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

	const onAccess = (address: number, handler: () => void) => {
		onRead(address, () => {
			handler();
			return 0;
		});
		onWrite(address, () => {
			handler();
		});
	};

	// --- Keyboard ---
	onRead(SoftSwitches.KBD, () => bus.lastKey | (bus.keyStrobe ? 0x80 : 0x00));
	onRead(SoftSwitches.KBDSTRB, () => {
		bus.keyStrobe = false;
		return 0;
	});
	onWrite(SoftSwitches.KBDSTRB, () => {
		bus.keyStrobe = false;
	});

	// --- Annunciator for Double Res Video ---
	onAccess(SoftSwitches.SETAN3, () => {
		bus.dblRes = false;
		/*
			src : https://mirrors.apple2.org.za/ftp.apple.asimov.net/documentation/hardware/video/Video-7%20RGB-SL7.pdf
			src : https://www.fenarinarsa.com/?p=1440#Les_modes_DHGR_des_cartes_RGB_Apple_Video-7_Chat_Mauve_EVEFelineIIc

			the whole mechanism is quite simple:
			  there is a hidden 2-bit register in the card and to set the bits, we need to do a sequence of CLRAN3/SETAN3 (which will push a bit to the hidden register).
			  As this is a 2-bit register, we need 2 sequences of CLRAN3/SETAN3.
			  The value of the bit to push is set with COL80ON:0/COL80OFF:1.
			  The first push is bit 0, the second is bit 1.
			  Here are the modes:
			  	<hidden bit> : <mode>
				00 : 140x192 colours
				01 : 160x192 colours
				10 : mixed 140x192 colours / 560x192 b&w
				11 : 560x192 b&w
		*/
		if (bus.video7SeqState === 1) {
			// Sequence complete, push the bit
			if (bus.video7NextBit === 0) {
				// This is the first push, for bit 0.
				bus.video7Register = (bus.video7Register & 0b10) | (bus.col80 ? 0x00 : 0x01); //bus.video7BitToPush;
				bus.video7NextBit = 1; // Next push will be for bit 1.
			} else {
				// This is the second push, for bit 1.
				bus.video7Register = (bus.video7Register & 0b01) | ((bus.col80 ? 0x00 : 0x01) << 1); //(bus.video7BitToPush << 1);
				bus.video7NextBit = 0; // Reset for the next 2-bit sequence.
			}
		}
		// Any access to SETAN3 resets the sequence state, regardless of whether it completed a sequence.
		bus.video7SeqState = 0;
	});
	onAccess(SoftSwitches.CLRAN3, () => {
		bus.dblRes = true;
		// CLRAN3 always starts the sequence.
		bus.video7SeqState = 1;
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
	onRead(SoftSwitches.CLOCKCTL, () => bus.brdrColor);

	onRead(SoftSwitches.RDVBLBAR, () => (bus.fakingVBL ? 0x80 : 0x00));

	// --- Video State Writes ---
	onWrite(SoftSwitches.STORE80OFF, () => {
		bus.store80 = false;
	});
	onWrite(SoftSwitches.STORE80ON, () => {
		bus.store80 = true;
	});
	onWrite(SoftSwitches.COL80OFF, () => {
		bus.col80 = false;
		// bus.video7BitToPush = 1;
	});
	onWrite(SoftSwitches.COL80ON, () => {
		bus.col80 = true;
		// bus.video7BitToPush = 0;
	});
	onWrite(SoftSwitches.ALTCHARSETOFF, () => {
		bus.altChar = false;
	});
	onWrite(SoftSwitches.ALTCHARSETON, () => {
		bus.altChar = true;
	});
	onWrite(SoftSwitches.TBCOLOR, (v) => {
		bus.tbColor = v;
	});
	onWrite(SoftSwitches.CLOCKCTL, (v) => {
		bus.brdrColor = v;
	});

	// R/W switches that trigger state changes
	onAccess(SoftSwitches.TEXTOFF, () => {
		bus.text = false;
	});
	onAccess(SoftSwitches.TEXTON, () => {
		bus.text = true;
	});
	onAccess(SoftSwitches.MIXEDOFF, () => {
		bus.mixed = false;
	});
	onAccess(SoftSwitches.MIXEDON, () => {
		bus.mixed = true;
	});
	onAccess(SoftSwitches.PAGE2OFF, () => {
		bus.page2 = false;
	});
	onAccess(SoftSwitches.PAGE2ON, () => {
		bus.page2 = true;
	});
	onAccess(SoftSwitches.HIRESOFF, () => {
		bus.hires = false;
	});
	onAccess(SoftSwitches.HIRESON, () => {
		bus.hires = true;
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

	onAccess(SoftSwitches.PTRIG, () => {
		bus.paddleTimers[0] = bus.totalCycles + (bus.paddleValues[0] as number) * PADDLE_TIMEOUT_MULTIPLIER;
		bus.paddleTimers[1] = bus.totalCycles + (bus.paddleValues[1] as number) * PADDLE_TIMEOUT_MULTIPLIER;
		bus.paddleTimers[2] = bus.totalCycles + (bus.paddleValues[2] as number) * PADDLE_TIMEOUT_MULTIPLIER;
		bus.paddleTimers[3] = bus.totalCycles + (bus.paddleValues[3] as number) * PADDLE_TIMEOUT_MULTIPLIER;
	});
	onRead(SoftSwitches.PADDL0, () => (bus.totalCycles < bus.paddleTimers[0] ? 0x80 : 0x00));
	onRead(SoftSwitches.PADDL1, () => (bus.totalCycles < bus.paddleTimers[1] ? 0x80 : 0x00));
	onRead(SoftSwitches.PADDL2, () => (bus.totalCycles < bus.paddleTimers[2] ? 0x80 : 0x00));
	onRead(SoftSwitches.PADDL3, () => (bus.totalCycles < bus.paddleTimers[3] ? 0x80 : 0x00));

	// --- Speaker ---
	onAccess(SoftSwitches.SPEAKER, () => bus.speaker.toggle());

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
