import type { DebugOption, IBus, MachineStateSpec } from "@/cpu/bus.interface";
import { MACHINE_STATE_OFFSET } from "@/cpu/shared-memory";
import * as SoftSwitches from "./softswitches";

// Apple II specific flags (packed into the MACHINE_STATE bytes)
// Byte at MACHINE_STATE_OFFSET
const APPLE_LC_BANK2_MASK = 0b0000_0001;
const APPLE_LC_READRAM_MASK = 0b0000_0010;
const APPLE_LC_WRITERAM_MASK = 0b0000_0100;
const APPLE_STORE80_MASK = 0b0000_1000;
const APPLE_RAMRD_AUX_MASK = 0b0001_0000;
const APPLE_RAMWR_AUX_MASK = 0b0010_0000;
const APPLE_ALTZP_MASK = 0b0100_0000;
const APPLE_INTCXROM_MASK = 0b1000_0000;
// Byte at MACHINE_STATE_OFFSET + 1
const APPLE_SLOTC3ROM_MASK = 0b0000_0001;
const APPLE_80COL_MASK = 0b0000_0010;
const APPLE_ALTCHAR_MASK = 0b0000_0100;
const APPLE_TEXT_MASK = 0b0000_1000;
const APPLE_MIXED_MASK = 0b0001_0000;
const APPLE_PAGE2_MASK = 0b0010_0000;
const APPLE_HIRES_MASK = 0b0100_0000;

const RAM_OFFSET = 0x4000; // 16KB reserved for Bank2 (4KB) + ROM (12KB) at the beginning

export class AppleBus implements IBus {
	private memory: Uint8Array;
	private registers?: DataView;
	// Private storage for the system ROM ($D000-$FFFF)
	private rom: Uint8Array;
	// Private storage for Language Card Bank 2 RAM ($D000-$DFFF)
	private bank2: Uint8Array;
	// Internal ROM ($C100-$CFFF) mapped to main RAM bank
	private romC: Uint8Array;
	// Slot ROMs ($C100-$CFFF) mapped to aux RAM bank
	private slotRoms: Uint8Array;

	// Language Card State
	private lcBank2 = false; // false = Bank 1 ($D000), true = Bank 2 ($D000)
	private lcReadRam = false; // false = Read ROM, true = Read RAM
	private lcWriteRam = false; // false = Write Protect, true = Write Enable
	private lcPreWriteCount = 0; // Counter for the double-read write enable mechanism

	// Main/Aux Memory State
	private store80 = false;
	private ramRdAux = false; // Read from Aux memory ($0200-$BFFF)
	private ramWrAux = false; // Write to Aux memory ($0200-$BFFF)
	private altZp = false; // Use Aux for ZP/Stack and LC area

	// Slot ROM State
	private intCxRom = false; // false = Slot, true = Internal
	private slotC3Rom = false; // false = Internal, true = Slot

	// Video State
	private col80 = false; // 80 Column Store/Display
	private altChar = false; // Alternate Character Set
	private text = true; // Text Mode
	private mixed = false; // Mixed Mode
	private page2 = false; // Page 2
	private hires = false; // Hi-Res Mode

	// Keyboard State
	private lastKey = 0x00;
	private keyStrobe = false;

	// Game I/O / Pushbutton State
	private pb0 = false; // Open Apple (Left Alt)
	private pb1 = false; // Solid Apple (Right Alt)

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
	}

	public setRegistersView(view: DataView) {
		this.registers = view;
	}

	public syncState() {
		if (!this.registers) return;

		let byte1 = 0;
		if (this.lcBank2) byte1 |= APPLE_LC_BANK2_MASK;
		if (this.lcReadRam) byte1 |= APPLE_LC_READRAM_MASK;
		if (this.lcWriteRam) byte1 |= APPLE_LC_WRITERAM_MASK;
		if (this.store80) byte1 |= APPLE_STORE80_MASK;
		if (this.ramRdAux) byte1 |= APPLE_RAMRD_AUX_MASK;
		if (this.ramWrAux) byte1 |= APPLE_RAMWR_AUX_MASK;
		if (this.altZp) byte1 |= APPLE_ALTZP_MASK;
		if (this.intCxRom) byte1 |= APPLE_INTCXROM_MASK;
		this.registers.setUint8(MACHINE_STATE_OFFSET, byte1);

		let byte2 = 0;
		if (this.slotC3Rom) byte2 |= APPLE_SLOTC3ROM_MASK;
		if (this.col80) byte2 |= APPLE_80COL_MASK;
		if (this.altChar) byte2 |= APPLE_ALTCHAR_MASK;
		if (this.text) byte2 |= APPLE_TEXT_MASK;
		if (this.mixed) byte2 |= APPLE_MIXED_MASK;
		if (this.page2) byte2 |= APPLE_PAGE2_MASK;
		if (this.hires) byte2 |= APPLE_HIRES_MASK;
		this.registers.setUint8(MACHINE_STATE_OFFSET + 1, byte2);
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
		this.slotC3Rom = false;

		this.col80 = false;
		this.altChar = false;
		this.text = true;
		this.mixed = false;
		this.page2 = false;
		this.hires = false;

		this.syncState();
	}

	public async prepareWorkerPayloads(): Promise<{ video?: unknown; bus?: unknown }> {
		if (typeof document === "undefined") return {};

		// Ensure the font is loaded
		await document.fonts.load("14px PrintChar21");

		const canvas = document.createElement("canvas");
		const ctx = canvas.getContext("2d");
		if (!ctx) return {};

		// Create a 16x16 grid for 256 characters
		const charWidth = 14;
		const charHeight = 14 + 1;
		const cols = 16;
		const rows = 16;

		canvas.width = cols * charWidth;
		canvas.height = rows * charHeight;

		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.fillStyle = "white";
		ctx.font = "14px PrintChar21";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";

		for (let i = 0; i < 256; i++) {
			const char = mapAppleChr(i); //String.fromCharCode(i);
			const col = i % cols;
			const row = Math.floor(i / cols);
			const x = col * charWidth + charWidth / 2;
			const y = row * charHeight + charHeight / 2;
			ctx.fillText(char, x, y);
		}

		const charmap = await createImageBitmap(canvas);

		return {
			video: {
				charmap,
				metrics: { charWidth, charHeight, cols, rows, offsetTop: 2, offsetLeft: 3 },
			},
		};
	}

	public readStateFromBuffer(view: DataView): Record<string, boolean> {
		const byte1 = view.getUint8(MACHINE_STATE_OFFSET);
		const byte2 = view.getUint8(MACHINE_STATE_OFFSET + 1);

		return {
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
		};
	}

	read(address: number): number {
		if (address >= 0xc000 && address <= 0xc0ff) {
			return this.readSoftSwitch(address);
		}

		this.lcPreWriteCount = 0;

		let bankOffset = 0;
		if (address < 0x0200 && this.altZp) {
			bankOffset = 0x10000;
		} else if (address >= 0x0200 && address < 0xc000 && this.ramRdAux) {
			bankOffset = 0x10000;
		} else if (address >= 0xd000 && this.altZp) {
			bankOffset = 0x10000;
		}

		if (bankOffset > 0) {
			return this.memory[RAM_OFFSET + address + bankOffset] ?? 0;
		}

		// Slot ROMs / Internal ROM ($C100-$CFFF)
		if (address >= 0xc100 && address <= 0xcfff) {
			const offset = address - 0xc100;
			let value = 0;

			// INTCXROM ($C015) overrides everything to Internal
			if (this.intCxRom) {
				value = this.romC[offset];
			} else if (address >= 0xc300 && address <= 0xc3ff && !this.slotC3Rom) {
				// Slot C3 handling ($C300-$C3FF)
				value = this.romC[offset];
			} else {
				value = this.slotRoms[offset];
			}

			// Reading from $CFFF disables the internal Cx ROM
			if (address === 0xcfff) this.intCxRom = false;

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

	write(address: number, value: number): void {
		if (address >= 0xc000 && address <= 0xc0ff) {
			this.writeSoftSwitch(address, value);
			return;
		}

		this.lcPreWriteCount = 0;

		let bankOffset = 0;
		if (address < 0x0200 && this.altZp) {
			bankOffset = 0x10000;
		} else if (address >= 0x0200 && address < 0xc000 && this.ramWrAux) {
			bankOffset = 0x10000;
		} else if (address >= 0xd000 && this.altZp) {
			bankOffset = 0x10000;
		}

		if (bankOffset > 0) {
			this.memory[RAM_OFFSET + address + bankOffset] = value & 0xff;
			return;
		}

		// Protect ROM area ($C100-$CFFF) from writes
		if (address >= 0xc100 && address <= 0xcfff) return;

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

	private updateLcState(address: number) {
		const bit0 = (address & 1) !== 0; // 0=Read RAM/ROM, 1=Write RAM (maybe)
		const bit1 = (address & 2) !== 0; // 0=Read RAM/ROM, 1=Read ROM
		const bit3 = (address & 8) !== 0; // 0=Bank 2, 1=Bank 1

		this.lcBank2 = !bit3;
		this.lcReadRam = !bit1; // If bit1 is set, we read ROM. If clear, we read RAM.

		// Write Enable Logic:
		// If bit0 is clear ($C080, $C082...), write is disabled immediately.
		// If bit0 is set ($C081, $C083...), write is enabled ONLY if this is the second consecutive read.
		if (!bit0) {
			this.lcWriteRam = false;
			this.lcPreWriteCount = 0;
		} else {
			this.lcPreWriteCount++;
			if (this.lcPreWriteCount > 1) {
				this.lcWriteRam = true;
				this.lcPreWriteCount = 0; // Reset after enabling? Behavior varies, but usually stays enabled.
			}
		}
	}

	private readSoftSwitch(address: number): number {
		if (address >= SoftSwitches.LCRAMIN2 && address <= SoftSwitches.LC_C08F) {
			this.updateLcState(address);
			return 0;
		}

		switch (address) {
			case SoftSwitches.KBD:
				return this.lastKey | (this.keyStrobe ? 0x80 : 0x00);
			case SoftSwitches.KBDSTRB:
				this.keyStrobe = false;
				return 0;
			case SoftSwitches.STORE80:
				return this.store80 ? 0x80 : 0x00;
			case SoftSwitches.RAMRD:
				return this.ramRdAux ? 0x80 : 0x00;
			case SoftSwitches.RAMWRT:
				return this.ramWrAux ? 0x80 : 0x00;
			case SoftSwitches.ALTZP:
				return this.altZp ? 0x80 : 0x00;
			case SoftSwitches.RDLCBNK2:
				return this.lcBank2 ? 0x80 : 0x00;
			case SoftSwitches.RDLCRAM:
				return this.lcReadRam ? 0x80 : 0x00;
			case SoftSwitches.INTCXROM:
				return this.intCxRom ? 0x80 : 0x00;
			case SoftSwitches.SLOTC3ROM:
				return this.slotC3Rom ? 0x80 : 0x00;
			case SoftSwitches.PB0:
				return this.pb0 ? 0x80 : 0x00;
			case SoftSwitches.PB1:
				return this.pb1 ? 0x80 : 0x00;
			case SoftSwitches.COL80: // 80COL
				return this.col80 ? 0x80 : 0x00;
			case SoftSwitches.ALTCHARSET: // ALTCHAR
				return this.altChar ? 0x80 : 0x00;
			case SoftSwitches.TEXT: // TEXT
				return this.text ? 0x80 : 0x00;
			case SoftSwitches.MIXED: // MIXED
				return this.mixed ? 0x80 : 0x00;
			case SoftSwitches.PAGE2: // PAGE2
				return this.page2 ? 0x80 : 0x00;
			case SoftSwitches.HIRES: // HIRES
				return this.hires ? 0x80 : 0x00;
		}
		return 0;
	}

	private writeSoftSwitch(address: number, _value: number): void {
		if (address >= SoftSwitches.LCRAMIN2 && address <= SoftSwitches.LC_C08F) {
			this.updateLcState(address);
			return;
		}

		switch (address) {
			case SoftSwitches.STORE80OFF:
				this.store80 = false;
				break;
			case SoftSwitches.STORE80ON:
				this.store80 = true;
				break;
			case SoftSwitches.RAMRDOFF:
				this.ramRdAux = false;
				break;
			case SoftSwitches.RAMRDON:
				this.ramRdAux = true;
				break;
			case SoftSwitches.RAMWRTOFF:
				this.ramWrAux = false;
				break;
			case SoftSwitches.RAMWRTON:
				this.ramWrAux = true;
				break;
			case SoftSwitches.ALTZPOFF:
				this.altZp = false;
				break;
			case SoftSwitches.ALTZPON:
				this.altZp = true;
				break;
			case SoftSwitches.INTCXROMOFF:
				this.intCxRom = false;
				break;
			case SoftSwitches.INTCXROMON:
				this.intCxRom = true;
				break;
			case SoftSwitches.SLOTC3ROMOFF:
				this.slotC3Rom = false;
				break;
			case SoftSwitches.SLOTC3ROMON:
				this.slotC3Rom = true;
				break;
			case SoftSwitches.KBDSTRB:
				this.keyStrobe = false;
				break;
			case SoftSwitches.COL80OFF: // 80COL OFF
				this.col80 = false;
				break;
			case SoftSwitches.COL80ON: // 80COL ON
				this.col80 = true;
				break;
			case SoftSwitches.ALTCHARSETOFF: // ALTCHAR OFF
				this.altChar = false;
				break;
			case SoftSwitches.ALTCHARSETON: // ALTCHAR ON
				this.altChar = true;
				break;
			case SoftSwitches.TEXTOFF: // TEXT OFF
				this.text = false;
				break;
			case SoftSwitches.TEXTON: // TEXT ON
				this.text = true;
				break;
			case SoftSwitches.MIXEDOFF: // MIXED OFF
				this.mixed = false;
				break;
			case SoftSwitches.MIXEDON: // MIXED ON
				this.mixed = true;
				break;
			case SoftSwitches.PAGE2OFF: // PAGE2 OFF
				this.page2 = false;
				break;
			case SoftSwitches.PAGE2ON: // PAGE2 ON
				this.page2 = true;
				break;
			case SoftSwitches.HIRESOFF: // HIRES OFF
				this.hires = false;
				break;
			case SoftSwitches.HIRESON: // HIRES ON
				this.hires = true;
				break;
		}
	}

	load(address: number, data: Uint8Array, bank: number = 0, tag?: string): void {
		switch (tag) {
			// If loading into the Language Card range ($D000+), load into ROM buffer
			case "lgcard.rom": {
				if (data.length <= this.rom.length) {
					this.rom.set(data);
					console.log(`AppleBus: Loaded ${data.length} bytes into ROM at $D000`);
					return;
				}
				console.error(`AppleBus: Load out of bounds: lgcard.rom`);
				break;
			}
			case "lgcard.bank2":
				if (data.length <= this.rom.length) {
					this.bank2.set(data);
					console.log(`AppleBus: Loaded ${data.length} bytes into LC RAM 2 at $D000`);
					return;
				}
				console.error(`AppleBus: Load out of bounds: lgcard.bank2`);
				break;
			case "int.rom.cx":
				if (data.length <= this.romC.length) {
					this.romC.set(data);
					console.log(`AppleBus: Loaded ${data.length} bytes into Internal ROM C at $C100`);
					return;
				}
				console.error(`AppleBus: Load out of bounds: system.rom.c`);
				break;
			case "slots.rom":
				if (data.length <= this.slotRoms.length) {
					this.slotRoms.set(data);
					console.log(`AppleBus: Loaded ${data.length} bytes into Slot ROMs at $C100`);
					return;
				}
				console.error("AppleBus: Load out of bounds: slots.rom");
		}

		// Default load to physical RAM
		// Handle Bank 1 (Aux) offset if bank=1
		const physicalAddress = RAM_OFFSET + address + bank * 0x10000;
		if (physicalAddress + data.length <= this.memory.length) {
			this.memory.set(data, physicalAddress);
			console.log(`AppleBus: Loaded ${data.length} bytes into RAM at $${physicalAddress.toString(16)}`);
		} else console.error(`AppleBus: Load out of bounds: 0x$physicalAddress.toString(16)`);
	}

	public pressKey(key: string, code?: string) {
		if (code === "AltLeft") {
			this.pb0 = true;
			return;
		} else if (code === "AltRight") {
			this.pb1 = true;
			return;
		}

		let ascii = 0;
		if (key.length === 1) {
			ascii = key.charCodeAt(0);
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
			}
		}

		if (ascii > 0) {
			this.lastKey = ascii & 0x7f;
			this.keyStrobe = true;
		}
	}

	public releaseKey(_key: string, code?: string) {
		if (code === "AltLeft") {
			this.pb0 = false;
		} else if (code === "AltRight") {
			this.pb1 = false;
		}
	}

	readDebug(address: number, overrides?: Record<string, unknown>): number {
		if (address > 0xffff) return this.memory[RAM_OFFSET + address] ?? 0;

		if (address >= 0xc100 && address <= 0xcfff) {
			const view = overrides?.cxView;
			if (view === "INT") return this.romC[address - 0xc100] ?? 0;
			if (view === "SLOT") return this.slotRoms[address - 0xc100] ?? 0;
		}

		if (address < 0xc000) return this.memory[RAM_OFFSET + address] ?? 0;

		if (address >= 0xc100 && address <= 0xcfff) {
			const offset = address - 0xc100;
			if (this.intCxRom) return this.romC[offset];

			if (address >= 0xc300 && address <= 0xc3ff && !this.slotC3Rom) {
				return this.romC[offset];
			}

			return this.slotRoms[offset];
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

	getDebugOptions(): DebugOption[] {
		return [
			{
				id: "lcView",
				label: "LC ROM",
				type: "select",
				options: [
					{ label: "Auto", value: "AUTO" },
					{ label: "ROM", value: "ROM" },
					{ label: "LC Bank 1", value: "BANK1" },
					{ label: "LC Bank 2", value: "BANK2" },
				],
			},
			{
				id: "cxView",
				label: "Cx ROM",
				type: "select",
				options: [
					{ label: "Auto", value: "AUTO" },
					{ label: "Internal", value: "INT" },
					{ label: "Slots", value: "SLOT" },
				],
			},
		];
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
			{ id: "col80", label: "80 Columns", type: "led", group: "Video" },
			{ id: "altChar", label: "Alt Charset", type: "led", group: "Video" },
			{ id: "text", label: "Text Mode", type: "led", group: "Video" },
			{ id: "mixed", label: "Mixed Mode", type: "led", group: "Video" },
			{ id: "page2", label: "Page 2", type: "led", group: "Video" },
			{ id: "hires", label: "Hi-Res", type: "led", group: "Video" },
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
			slotC3Rom: this.slotC3Rom,
			col80: this.col80,
			altChar: this.altChar,
			text: this.text,
			mixed: this.mixed,
			page2: this.page2,
			hires: this.hires,
		};
	}

	loadState(state: Record<string, boolean>): void {
		this.lcBank2 = state.lcBank2 ?? this.lcBank2;
		this.lcReadRam = state.lcReadRam ?? this.lcReadRam;
		this.lcWriteRam = state.lcWriteRam ?? this.lcWriteRam;
		this.store80 = state.store80 ?? this.store80;
		this.ramRdAux = state.ramRdAux ?? this.ramRdAux;
		this.ramWrAux = state.ramWrAux ?? this.ramWrAux;
		this.altZp = state.altZp ?? this.altZp;
		this.intCxRom = state.intCxRom ?? this.intCxRom;
		this.slotC3Rom = state.slotC3Rom ?? this.slotC3Rom;
		this.col80 = state.col80 ?? this.col80;
		this.altChar = state.altChar ?? this.altChar;
		this.text = state.text ?? this.text;
		this.mixed = state.mixed ?? this.mixed;
		this.page2 = state.page2 ?? this.page2;
		this.hires = state.hires ?? this.hires;
	}
}

// Helper to convert Apple's weird character codes to something renderable
// This is a simplified mapping for "normal" characters (white on black)
function mapAppleChr(char: number): string {
	// For normal text mode characters, the high bit is set.
	// We're ignoring inverse and flashing for now.
	const ascii = char & 0x7f;

	// Characters in the range 0x40-0x7F are standard ASCII
	if (ascii >= 0x40 && ascii <= 0x7f) return String.fromCharCode(ascii);

	// Other ranges map to symbols or lowercase letters in special ways
	// This is a simplification.
	if (ascii < 0x20) return String.fromCharCode(ascii + 0x40); // Treat as control characters -> @, A, B...

	// For now, return a placeholder for unhandled characters
	return String.fromCharCode(ascii);
}
