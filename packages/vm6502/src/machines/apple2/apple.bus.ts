import type { Dict } from "@/types/dict.type";
import type { IBus, MachineStateSpec } from "@/virtualmachine/cpu/bus.interface";
import {
	INPUT_ANALOG_0_OFFSET,
	INPUT_ANALOG_1_OFFSET,
	INPUT_DIGITAL_OFFSET,
	MACHINE_STATE_OFFSET1,
	MACHINE_STATE_OFFSET2,
	MACHINE_STATE_OFFSET3,
	REG_BORDERCOLOR_OFFSET,
	REG_TBCOLOR_OFFSET,
} from "@/virtualmachine/cpu/shared-memory";
import { generateApple2Assets } from "./bus/apple.assets";
import { loadMemoryChunks } from "./bus/apple.loader";
import { installSoftSwitches } from "./bus/apple.switches";
import { MouseCard } from "./slots/mouse.card";
import type { ISlotCard } from "./slots/slotcard.interface";
import { SmartPortCard } from "./slots/smartport.card";
import { Speaker } from "./speaker";

// Apple II specific flags (packed into the MACHINE_STATE bytes)
// Byte at MACHINE_STATE_OFFSET1
const APPLE_LC_BANK2_MASK = 0b0000_0001;
const APPLE_LC_READRAM_MASK = 0b0000_0010;
const APPLE_LC_WRITERAM_MASK = 0b0000_0100;
const APPLE_STORE80_MASK = 0b0000_1000;
const APPLE_RAMRD_AUX_MASK = 0b0001_0000;
const APPLE_RAMWR_AUX_MASK = 0b0010_0000;
const APPLE_ALTZP_MASK = 0b0100_0000;
const APPLE_INTCXROM_MASK = 0b1000_0000;
// Byte at MACHINE_STATE_OFFSET2
const APPLE_SLOTC3ROM_MASK = 0b0000_0001;
const APPLE_80COL_MASK = 0b0000_0010;
const APPLE_ALTCHAR_MASK = 0b0000_0100;
const APPLE_TEXT_MASK = 0b0000_1000;
const APPLE_MIXED_MASK = 0b0001_0000;
const APPLE_PAGE2_MASK = 0b0010_0000;
const APPLE_HIRES_MASK = 0b0100_0000;
const APPLE_INTC8ROM_MASK = 0b1000_0000;
// Byte at MACHINE_STATE_OFFSET3
const APPLE_DBLRES_MASK = 0b0000_0001;
const APPLE_VIDEO7_REG_MASK = 0b0000_0110; // bits 1,2
const APPLE_VIDEO7_REG_SHIFT = 1;

const RAM_OFFSET = 0x4000; // 16KB reserved for Bank2 (4KB) + ROM (12KB) at the beginning

// IIgs default colors - white on blue
const DEFAULT_TEXT_COLORS = 0xf2;

export class AppleBus implements IBus {
	public memory: Uint8Array;
	private registers?: DataView;
	// Private storage for the system ROM ($D000-$FFFF)
	public rom: Uint8Array;
	// Private storage for Language Card Bank 2 RAM ($D000-$DFFF)
	public bank2: Uint8Array;
	// Internal ROM ($C100-$CFFF) mapped to main RAM bank
	public romC: Uint8Array;
	// Slot ROMs ($C100-$CFFF) mapped to aux RAM bank
	public slotRoms: Uint8Array;

	// Slot System
	public slots: (ISlotCard | null)[] = new Array(8).fill(null);
	private activeExpansionSlot = 0;

	// Language Card State
	public lcBank2 = false; // false = Bank 1 ($D000), true = Bank 2 ($D000)
	public lcReadRam = false; // false = Read ROM, true = Read RAM
	public lcWriteRam = false; // false = Write Protect, true = Write Enable
	public lcPreWriteCount = 0; // Counter for the double-read write enable mechanism

	// Main/Aux Memory State
	public store80 = false;
	public ramRdAux = false; // Read from Aux memory ($0200-$BFFF)
	public ramWrAux = false; // Write to Aux memory ($0200-$BFFF)
	public altZp = false; // Use Aux for ZP/Stack and LC area

	// Slot ROM State
	public intCxRom = false; // false = Slot, true = Internal
	public intC8Rom = false; // Hardware hack for Slot 3 (Internal C800)
	public slotC3Rom = false; // false = Internal, true = Slot

	// Video State
	public col80 = false; // 80 Column Store/Display
	public altChar = false; // Alternate Character Set
	public text = true; // Text Mode
	public mixed = false; // Mixed Mode
	public page2 = false; // Page 2
	public hires = false; // Hi-Res Mode
	public fakingVBL = false;
	public dblRes = false;

	// Video-7 State
	public video7Register = 0; // 2-bit register for extended modes
	// public video7BitToPush = 0; // 0 or 1, set by 80COL softswitches
	public video7SeqState = 0; // 0=idle, 1=CLRAN3 seen
	public video7NextBit = 0; // 0=pushing bit 0, 1=pushing bit 1

	public tbColor = DEFAULT_TEXT_COLORS; // IIgs text/bg color (black bg, white text)
	public brdrColor = DEFAULT_TEXT_COLORS & 0x0f; // IIgs border color

	// Keyboard State
	public lastKey = 0x00;
	public keyStrobe = false;

	// Game I/O / Pushbutton State
	public kbd_pb0 = false; // Open Apple (from keyboard)
	public kbd_pb1 = false; // Solid Apple (from keyboard)
	public joy_pb0 = false; // from joystick
	public joy_pb1 = false; // from joystick

	get pb0() {
		return this.kbd_pb0 || this.joy_pb0;
	}
	get pb1() {
		return this.kbd_pb1 || this.joy_pb1;
	}

	// Paddles
	public paddleValues: [number, number, number, number] = [127, 127, 127, 127]; // 0-255, from joystick
	public paddleTimers: [number, number, number, number] = [0, 0, 0, 0];
	public totalCycles = 0;

	// Speaker State
	public speaker: Speaker;

	private tickHandlers: ((cycles: number) => void)[] = [];

	// Soft Switch Dispatch Tables (0xC000 - 0xC0FF)
	private readHandlers: Array<() => number>;
	private writeHandlers: Array<(val: number) => void>;

	constructor(memory: Uint8Array) {
		this.memory = memory;
		// Map Bank 2 and ROM to the beginning of shared memory
		// Bank 2: 0x0000 - 0x0FFF (4KB)
		this.bank2 = this.memory.subarray(0x0000, 0x1000);
		// ROM: 0x1000 - 0x3FFF (12KB)
		this.rom = this.memory.subarray(0x1000, 0x4000);
		// Internal C-ROM: $C100-$CFFF in main RAM
		this.romC = this.memory.subarray(RAM_OFFSET + 0xc100, RAM_OFFSET + 0xd000);
		// Slot ROMs: $C100-$CFFF in aux RAM
		this.slotRoms = this.memory.subarray(RAM_OFFSET + 0x1c100, RAM_OFFSET + 0x1d000);

		// Install SmartPort Card in Slot 5
		const slot5Rom = this.slotRoms.subarray(0x400, 0x500);
		this.installCard(new SmartPortCard(this, 5, slot5Rom));

		const slot4Rom = this.slotRoms.subarray(0x300, 0x400);
		this.installCard(new MouseCard(this, 4, slot4Rom));

		// this.installCard(new MockingboardCard(4));

		const handlers = installSoftSwitches(this);
		this.readHandlers = handlers.readHandlers;
		this.writeHandlers = handlers.writeHandlers;

		this.speaker = new Speaker(this);
	}

	public registerTickHandler(handler: (cycles: number) => void) {
		this.tickHandlers.push(handler);
	}

	public removeTickHandler(handler: (cycles: number) => void) {
		const index = this.tickHandlers.indexOf(handler);
		if (index > -1) this.tickHandlers.splice(index, 1);
	}

	public tick(deltaCycles: number): void {
		this.totalCycles += deltaCycles;

		if (this.registers) {
			// Read analog inputs as floats and convert to 0-255 byte
			const axisX = this.registers.getFloat32(INPUT_ANALOG_0_OFFSET, true); // -1.0 to 1.0
			const axisY = this.registers.getFloat32(INPUT_ANALOG_1_OFFSET, true); // -1.0 to 1.0

			// axisX = Math.round((axisX + Number.EPSILON) * 10) / 10;
			// axisY = Math.round((axisY + Number.EPSILON) * 10) / 10;

			// Convert float to paddle value.
			this.paddleValues[0] = Math.max(0, Math.min(255, Math.round(((axisX + 1) / 2) * 255)));
			this.paddleValues[1] = Math.max(0, Math.min(255, Math.round(((axisY + 1) / 2) * 255)));

			// Read digital inputs
			const digital1 = this.registers.getUint8(INPUT_DIGITAL_OFFSET);
			this.joy_pb0 = (digital1 & 0b0000_0001) !== 0;
			this.joy_pb1 = (digital1 & 0b0000_0010) !== 0;
		}

		if (deltaCycles <= 0) return;
		for (let index = 0; index < this.tickHandlers.length; index++) {
			// biome-ignore lint/style/noNonNullAssertion: <if present then always defined>
			this.tickHandlers[index]!(deltaCycles);
		}
	}

	public installCard(card: ISlotCard) {
		if (this.slots[card.slot]) {
			console.error(`Slot ${card.slot} already installed !`);
			return;
		}
		this.slots[card.slot] = card;
		if (this.registers && card.setRegisters) card.setRegisters(this.registers);
		if (card.tick) this.registerTickHandler(card.tick.bind(card));
	}

	public initAudio(sampleRate: number): void {
		this.speaker.init(sampleRate);
		console.log("AppleBus audio initialized");
	}

	public enableAudio?(isEnabled: boolean) {
		this.speaker.setEnabled(isEnabled);
	}

	public setRegistersView(view: DataView) {
		this.registers = view;
		this.slots.forEach((card) => {
			card?.setRegisters?.(view);
		});
	}

	public setDebugOverrides(overrides: { slot?: number } & Dict) {
		if (overrides.slot) {
			const card = this.slots[overrides.slot];
			if (card) card.setDebugOverrides?.(overrides);
		}
	}

	public syncState() {
		if (!this.registers) return;

		this.fakingVBL = !this.fakingVBL;

		let byte1 = 0;
		if (this.lcBank2) byte1 |= APPLE_LC_BANK2_MASK;
		if (this.lcReadRam) byte1 |= APPLE_LC_READRAM_MASK;
		if (this.lcWriteRam) byte1 |= APPLE_LC_WRITERAM_MASK;
		if (this.store80) byte1 |= APPLE_STORE80_MASK;
		if (this.ramRdAux) byte1 |= APPLE_RAMRD_AUX_MASK;
		if (this.ramWrAux) byte1 |= APPLE_RAMWR_AUX_MASK;
		if (this.altZp) byte1 |= APPLE_ALTZP_MASK;
		if (this.intCxRom) byte1 |= APPLE_INTCXROM_MASK;
		this.registers.setUint8(MACHINE_STATE_OFFSET1, byte1);

		let byte2 = 0;
		if (this.slotC3Rom) byte2 |= APPLE_SLOTC3ROM_MASK;
		if (this.col80) byte2 |= APPLE_80COL_MASK;
		if (this.altChar) byte2 |= APPLE_ALTCHAR_MASK;
		if (this.text) byte2 |= APPLE_TEXT_MASK;
		if (this.mixed) byte2 |= APPLE_MIXED_MASK;
		if (this.page2) byte2 |= APPLE_PAGE2_MASK;
		if (this.hires) byte2 |= APPLE_HIRES_MASK;
		if (this.intC8Rom) byte2 |= APPLE_INTC8ROM_MASK;
		this.registers.setUint8(MACHINE_STATE_OFFSET2, byte2);

		let byte3 = 0;
		if (this.dblRes) byte3 |= APPLE_DBLRES_MASK;
		byte3 |= (this.video7Register << APPLE_VIDEO7_REG_SHIFT) & APPLE_VIDEO7_REG_MASK;
		this.registers.setUint8(MACHINE_STATE_OFFSET3, byte3);

		this.registers.setUint8(REG_TBCOLOR_OFFSET, this.tbColor);
		this.registers.setUint8(REG_BORDERCOLOR_OFFSET, this.brdrColor);
	}

	public reset() {
		this.lcBank2 = false;
		this.lcReadRam = false;
		this.lcWriteRam = false;
		this.lcPreWriteCount = 0;

		this.store80 = false;
		this.ramRdAux = false;
		this.ramWrAux = false;
		this.altZp = false;

		this.intCxRom = false;
		this.intC8Rom = false;
		this.slotC3Rom = false;

		this.col80 = false;
		this.altChar = false;
		this.text = true;
		this.mixed = false;
		this.page2 = false;
		this.hires = false;
		this.tbColor = DEFAULT_TEXT_COLORS;
		this.dblRes = false;

		this.video7Register = 0;
		// this.video7BitToPush = 0;
		this.video7SeqState = 0;
		this.video7NextBit = 0;

		this.kbd_pb0 = false;
		this.kbd_pb1 = false;
		this.joy_pb0 = false;
		this.joy_pb1 = false;
		this.paddleValues.fill(127);
		this.paddleTimers.fill(0);
		this.totalCycles = 0;

		this.syncState();
	}

	public async prepareWorkerPayloads(): Promise<{ video?: unknown; bus?: unknown }> {
		return generateApple2Assets();
	}

	public syncStateFromBuffer(view: DataView): Dict {
		const byte1 = view.getUint8(MACHINE_STATE_OFFSET1);
		const byte2 = view.getUint8(MACHINE_STATE_OFFSET2);
		const byte3 = view.getUint8(MACHINE_STATE_OFFSET3);

		const state = {
			lcBank2: (byte1 & APPLE_LC_BANK2_MASK) !== 0,
			lcReadRam: (byte1 & APPLE_LC_READRAM_MASK) !== 0,
			lcWriteRam: (byte1 & APPLE_LC_WRITERAM_MASK) !== 0,
			store80: (byte1 & APPLE_STORE80_MASK) !== 0,
			ramRdAux: (byte1 & APPLE_RAMRD_AUX_MASK) !== 0,
			ramWrAux: (byte1 & APPLE_RAMWR_AUX_MASK) !== 0,
			altZp: (byte1 & APPLE_ALTZP_MASK) !== 0,
			intCxRom: (byte1 & APPLE_INTCXROM_MASK) !== 0,

			slotC3Rom: (byte2 & APPLE_SLOTC3ROM_MASK) !== 0,
			col80: (byte2 & APPLE_80COL_MASK) !== 0,
			altChar: (byte2 & APPLE_ALTCHAR_MASK) !== 0,
			text: (byte2 & APPLE_TEXT_MASK) !== 0,
			mixed: (byte2 & APPLE_MIXED_MASK) !== 0,
			page2: (byte2 & APPLE_PAGE2_MASK) !== 0,
			hires: (byte2 & APPLE_HIRES_MASK) !== 0,
			intC8Rom: (byte2 & APPLE_INTC8ROM_MASK) !== 0,

			dblRes: (byte3 & APPLE_DBLRES_MASK) !== 0,
			video7Register: (byte3 & APPLE_VIDEO7_REG_MASK) >> APPLE_VIDEO7_REG_SHIFT,
		};

		// Load state into this bus instance
		this.lcBank2 = state.lcBank2;
		this.lcReadRam = state.lcReadRam;
		this.lcWriteRam = state.lcWriteRam;
		this.store80 = state.store80;
		this.ramRdAux = state.ramRdAux;
		this.ramWrAux = state.ramWrAux;
		this.altZp = state.altZp;
		this.intCxRom = state.intCxRom;
		this.intC8Rom = state.intC8Rom;
		this.slotC3Rom = state.slotC3Rom;
		this.col80 = state.col80;
		this.altChar = state.altChar;
		this.text = state.text;
		this.mixed = state.mixed;
		this.page2 = state.page2;
		this.hires = state.hires;
		this.dblRes = state.dblRes;
		this.video7Register = state.video7Register;

		this.tbColor = view.getUint8(REG_TBCOLOR_OFFSET);
		this.brdrColor = view.getUint8(REG_BORDERCOLOR_OFFSET);

		return {
			...state,
			tbColor: this.tbColor,
			brdrColor: this.brdrColor,
		};
	}

	read(address: number): number {
		// biome-ignore lint/style/noNonNullAssertion: all handlers are defined
		if (address >= 0xc000 && address <= 0xc0ff) return this.readHandlers[address & 0xff]!();

		// this.lcPreWriteCount = 0;

		let bankOffset = 0;
		if (address < 0x0200 && this.altZp) bankOffset = 0x10000;
		else if (address >= 0x0200 && address < 0xc000) {
			let aux = this.ramRdAux;
			if (this.store80) {
				if (address >= 0x0400 && address <= 0x07ff) aux = this.page2;
				else if (this.hires && address >= 0x2000 && address <= 0x3fff) aux = this.page2;
			}
			if (aux) bankOffset = 0x10000;
		} else if (address >= 0xd000 && this.altZp) bankOffset = 0x10000;
		if (bankOffset > 0) return this.memory[RAM_OFFSET + address + bankOffset] ?? 0;

		// Slot ROMs / Internal ROM ($C100-$CFFF)
		if (address >= 0xc100 && address <= 0xcfff) {
			const offset = address - 0xc100;

			// Reading from $CFFF disables the internal Cx ROM and resets expansion
			if (address === 0xcfff) {
				this.intC8Rom = false;
				this.activeExpansionSlot = 0;
			}

			// Hardware hack: Accessing Internal C3 ($C3xx) enables intC8Rom
			if (address >= 0xc300 && address <= 0xc3ff && this.slotC3Rom) {
				this.intC8Rom = true;
				return this.romC[offset] ?? 0;
			}

			// intC8Rom forces Internal
			if (address >= 0xc800 && this.intC8Rom) return this.romC[offset] ?? 0;

			// INTCXROM ($C015) overrides everything to Internal
			if (this.intCxRom) return this.romC[offset] ?? 0;

			// Handle Expansion ROM ($C800-$CFFF)
			if (address >= 0xc800) {
				if (this.activeExpansionSlot > 0 && this.slots[this.activeExpansionSlot]) {
					// biome-ignore lint/style/noNonNullAssertion: all slots are defined
					return this.slots[this.activeExpansionSlot]!.readExpansion(address - 0xc800);
				}
				return this.slotRoms[offset] ?? 0;
			}

			// Handle Slot ROMs ($C100-$C7FF)
			// Determine slot number from address (C1xx = Slot 1, etc.)
			const slot = (address >> 8) & 0x0f;

			// Special case for C3: Check slotC3Rom softswitch
			if (slot === 3 && !this.slotC3Rom) {
				return this.romC[offset] ?? 0;
			}

			if (this.slots[slot]) {
				this.activeExpansionSlot = slot;
				// biome-ignore lint/style/noNonNullAssertion: all slots are defined
				return this.slots[slot]!.readRom(address & 0xff);
			}

			const value = this.slotRoms[offset] ?? 0;

			return value;
		}

		if (address >= 0xd000) {
			if (this.lcReadRam) {
				if (this.lcBank2 && address < 0xe000) {
					return this.bank2[address - 0xd000] ?? 0;
				}
			} else {
				return this.rom[address - 0xd000] ?? 0;
			}
		}

		return this.memory[RAM_OFFSET + address] ?? 0;
	}

	public readRaw(address: number): number {
		return this.memory[RAM_OFFSET + address] ?? 0;
	}

	write(address: number, value: number): void {
		if (address >= 0xc000 && address <= 0xc0ff) {
			// biome-ignore lint/style/noNonNullAssertion: all handlers are defined
			this.writeHandlers[address & 0xff]!(value);
			return;
		}

		// this.lcPreWriteCount = 0;

		let bankOffset = 0;
		if (address < 0x0200 && this.altZp) {
			bankOffset = 0x10000;
		} else if (address >= 0x0200 && address < 0xc000) {
			let aux = this.ramWrAux;
			if (this.store80) {
				if (address >= 0x0400 && address <= 0x07ff) aux = this.page2;
				else if (this.hires && address >= 0x2000 && address <= 0x3fff) aux = this.page2;
			}
			if (aux) bankOffset = 0x10000;
		} else if (address >= 0xd000 && this.altZp) {
			bankOffset = 0x10000;
		}

		if (bankOffset > 0) {
			this.memory[RAM_OFFSET + address + bankOffset] = value & 0xff;
			return;
		}

		// Slot ROMs / Internal ROM ($C100-$CFFF)
		if (address >= 0xc100 && address <= 0xcfff) {
			if (address === 0xcfff) {
				this.intC8Rom = false;
				this.activeExpansionSlot = 0;
			}

			if (this.intCxRom) return;

			// Handle Expansion ROM ($C800-$CFFF)
			if (address >= 0xc800) {
				if (this.intC8Rom) return;
				if (this.activeExpansionSlot > 0 && this.slots[this.activeExpansionSlot]) {
					this.slots[this.activeExpansionSlot]?.writeExpansion?.(address - 0xc800, value);
				}
				return;
			}

			// Handle Slot ROMs ($C100-$C7FF)
			const slot = (address >> 8) & 0x0f;
			if (slot === 3 && !this.slotC3Rom) return;

			if (this.slots[slot]) {
				this.activeExpansionSlot = slot;
				this.slots[slot]?.writeRom?.(address & 0xff, value);
			}
			return;
		}

		if (address >= 0xd000) {
			if (this.lcWriteRam) {
				if (this.lcBank2 && address < 0xe000) {
					this.bank2[address - 0xd000] = value & 0xff;
				} else {
					this.memory[RAM_OFFSET + address] = value & 0xff;
				}
			}
			return;
		}

		this.memory[RAM_OFFSET + address] = value & 0xff;
	}

	load(address: number, data: Uint8Array, bank: number = 0, tag?: string): void {
		loadMemoryChunks(this, address, data, bank, tag);
	}

	public pressKey(key: string, code?: string, ctrl?: boolean) {
		if (code === "AltLeft") {
			this.kbd_pb0 = true;
			return;
		} else if (code === "AltRight") {
			this.kbd_pb1 = true;
			return;
		}

		let ascii = 0;
		if (key.length === 1) {
			ascii = key.charCodeAt(0);
			if (ctrl) {
				ascii = (ascii - 0x60) | 0x80;
			}
		} else {
			switch (key) {
				case "Enter":
					ascii = 13;
					break;
				case "Backspace":
				case "ArrowLeft":
					ascii = 8; // Apple II Left is BS (8)
					break;
				case "ArrowRight":
					ascii = 21; // Apple II Right is NAK (21)
					break;
				case "ArrowUp":
					ascii = 0x8b;
					break;
				case "ArrowDown":
					ascii = 0x8a;
					break;
				case "Escape":
					ascii = 0x9b;
					break;
			}
		}

		if (ascii > 0) {
			this.lastKey = ascii & 0x7f;
			this.keyStrobe = true;
		}
	}

	public releaseKey(_key: string, code?: string) {
		if (code === "AltLeft") {
			this.kbd_pb0 = false;
		} else if (code === "AltRight") {
			this.kbd_pb1 = false;
		}
	}

	readDebug(address: number, overrides?: Record<string, unknown>): number {
		if (address > 0xffff) return this.memory[RAM_OFFSET + address] ?? 0;

		if (address < 0xc000) return this.memory[RAM_OFFSET + address] ?? 0;

		if (address >= 0xc100 && address <= 0xcfff) {
			const offset = address - 0xc100;

			if (overrides) {
				const view = overrides?.cxView;
				if (view === "INT") return this.romC[offset] ?? 0;
				if (view === "SLOT") return this.slotRoms[offset] ?? 0;
			}

			// intC8Rom forces Internal
			if (address >= 0xc7ff && this.intC8Rom) return this.romC[offset] ?? 0;

			if (this.intCxRom) return this.romC[offset] ?? 0;

			if (address >= 0xc300 && address <= 0xc3ff && this.slotC3Rom) return this.romC[offset] ?? 0;

			return this.slotRoms[offset] ?? 0;
		}

		if (address >= 0xd000) {
			switch (overrides?.lcView) {
				case "ROM":
					return this.rom[address - 0xd000] ?? 0;
				case "BANK2":
					if (address < 0xe000) return this.bank2[address - 0xd000] ?? 0;
					else return this.memory[RAM_OFFSET + address] ?? 0;
				case "BANK1":
					return this.memory[RAM_OFFSET + address] ?? 0;
			}

			// Default view (what CPU sees, but no side effects like pre-write count reset)
			if (this.lcReadRam) {
				if (this.lcBank2 && address < 0xe000) {
					return this.bank2[address - 0xd000] ?? 0;
				}
				return this.memory[RAM_OFFSET + address] ?? 0;
			}
			return this.rom[address - 0xd000] ?? 0;
		}

		// Softswitches - return 0 to avoid side effects
		return 0;
	}

	writeDebug(address: number, value: number, overrides?: Record<string, unknown>): void {
		if (address > 0xffff) {
			this.memory[RAM_OFFSET + address] = value & 0xff;
			return;
		}

		if (address >= 0xc100 && address <= 0xcfff) {
			const view = overrides?.cxView;
			if (view === "INT") this.romC[address - 0xc100] = value & 0xff;
			if (view === "SLOT") this.slotRoms[address - 0xc100] = value & 0xff;
			return;
		}

		if (address >= 0xc100 && address <= 0xcfff) return;

		if (address >= 0xd000) {
			const view = overrides?.lcView;
			if (view === "ROM") {
				this.rom[address - 0xd000] = value & 0xff;
				return;
			}
			if (view === "BANK2" && address < 0xe000) {
				this.bank2[address - 0xd000] = value & 0xff;
				return;
			}
			if (view === "BANK1" || (view === "BANK2" && address >= 0xe000)) {
				this.memory[RAM_OFFSET + address] = value & 0xff;
				return;
			}

			// Write to whatever is currently visible (ignoring write protection)
			if (this.lcReadRam) {
				if (this.lcBank2 && address < 0xe000) {
					this.bank2[address - 0xd000] = value & 0xff;
				} else {
					this.memory[RAM_OFFSET + address] = value & 0xff;
				}
			} else {
				this.rom[address - 0xd000] = value & 0xff;
			}
			return;
		}

		if (address >= 0xc000 && address <= 0xc0ff) return;

		this.memory[RAM_OFFSET + address] = value & 0xff;
	}

	getMachineStateSpecs(): MachineStateSpec[] {
		return [
			{ id: "lcBank2", label: "LC Bank 2", type: "led", group: "Language Card" },
			{ id: "lcReadRam", label: "LC Read RAM", type: "led", group: "Language Card" },
			{ id: "lcWriteRam", label: "LC Write RAM", type: "led", group: "Language Card" },
			{ id: "store80", label: "80STORE", type: "led", group: "Main/Aux" },
			{ id: "ramRdAux", label: "RAM Read Aux", type: "led", group: "Main/Aux" },
			{ id: "ramWrAux", label: "RAM Write Aux", type: "led", group: "Main/Aux" },
			{ id: "altZp", label: "Alt Zero Page", type: "led", group: "Main/Aux" },
			{ id: "intCxRom", label: "Internal Cx ROM", type: "led", group: "Slot ROMs" },
			{ id: "slotC3Rom", label: "Slot C3 ROM", type: "led", group: "Slot ROMs" },
			{ id: "intC8Rom", label: "Internal C8 ROM", type: "led", group: "Slot ROMs" },
			{ id: "col80", label: "80 Columns", type: "led", group: "Video" },
			{ id: "altChar", label: "Alt Charset", type: "led", group: "Video" },
			{ id: "text", label: "Text Mode", type: "led", group: "Video" },
			{ id: "mixed", label: "Mixed Mode", type: "led", group: "Video" },
			{ id: "page2", label: "Page 2", type: "led", group: "Video" },
			{ id: "hires", label: "Hi-Res", type: "led", group: "Video" },
			{ id: "dblRes", label: "Dbl Hi-Res", type: "led", group: "Video" },
			{ id: "video7Register", label: "Video-7 Mode", type: "text", group: "Video" },
		];
	}

	saveState(): Record<string, boolean> {
		return {
			lcBank2: this.lcBank2,
			lcReadRam: this.lcReadRam,
			lcWriteRam: this.lcWriteRam,
			store80: this.store80,
			ramRdAux: this.ramRdAux,
			ramWrAux: this.ramWrAux,
			altZp: this.altZp,
			intCxRom: this.intCxRom,
			intC8Rom: this.intC8Rom,
			slotC3Rom: this.slotC3Rom,
			col80: this.col80,
			altChar: this.altChar,
			text: this.text,
			mixed: this.mixed,
			page2: this.page2,
			hires: this.hires,
			dblRes: this.dblRes,
		};
	}

	public insertMedia(data: Uint8Array, metadata?: Record<string, unknown>) {
		if (metadata && typeof metadata.slot === "number") {
			const card = this.slots[metadata.slot];
			if (card?.insertMedia) card.insertMedia(data, metadata);
		}
	}

	public getScope(address: number): string {
		if (address < 0x0200) return this.altZp ? "aux" : "main";

		if (address < 0xc000) {
			let aux = this.ramRdAux;
			if (this.store80) {
				if (address >= 0x0400 && address <= 0x07ff) aux = this.page2;
				else if (this.hires && address >= 0x2000 && address <= 0x3fff) aux = this.page2;
			}
			return aux ? "aux" : "main";
		}

		if (address <= 0xcfff) {
			if (address < 0xc100) return "io";

			// Internal Cx ROM override
			if (this.intCxRom) return "int_rom";

			// C800-CFFF
			if (address >= 0xc800) {
				if (this.intC8Rom) return "int_rom";
				// if (this.activeExpansionSlot > 0 && this.slots[this.activeExpansionSlot])
				// 	return `slot_rom_${this.activeExpansionSlot}`;
				return "slot_rom";
			}

			// C100-C7FF
			const slot = (address >> 8) & 0x0f;
			if (slot === 3 && !this.slotC3Rom) return "int_rom";
			// if (this.slots[slot]) return `slot_rom_${slot}`;

			return "slot_rom";
		}

		if (!this.lcReadRam) return "rom";
		if (this.lcBank2 && address < 0xe000) return "lc_bank2";
		return "lc_bank1";
	}

	public getScopes?() {
		return ["main", "aux", "io", "int_rom", "slot_rom", "rom", "lc_bank1", "lc_bank2"];
	}
}
