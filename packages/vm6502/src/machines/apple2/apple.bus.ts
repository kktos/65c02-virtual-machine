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

	// Keyboard State
	private lastKey = 0x00;
	private keyStrobe = false;

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

		this.syncState();
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
		};
	}

	read(address: number): number {
		if (address >= 0xc000 && address <= 0xc0ff) {
			return this.accessSoftSwitch(address, null);
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
			// INTCXROM ($C015) overrides everything to Internal
			if (this.intCxRom) return this.romC[offset];

			// Slot C3 handling ($C300-$C3FF)
			if (address >= 0xc300 && address <= 0xc3ff && !this.slotC3Rom) {
				return this.romC[offset];
			}

			return this.slotRoms[offset];
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
			this.accessSoftSwitch(address, value);
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

	private accessSoftSwitch(address: number, writeValue: number | null): number {
		const isWrite = writeValue !== null;

		// Language Card Switches ($C080 - $C08F)
		if (address >= SoftSwitches.LCRAMIN2 && address <= SoftSwitches.LC_C08F) {
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

			// console.log(
			// 	`LC Switch ${address.toString(16)}: Bank2=${this.lcBank2}, ReadRAM=${this.lcReadRam}, WriteRAM=${this.lcWriteRam}`,
			// );
			return 0; // Floating bus usually
		}

		// Other switches
		switch (address) {
			// Write switches
			case SoftSwitches.STORE80OFF:
				if (isWrite) this.store80 = false;
				break;
			case SoftSwitches.STORE80ON:
				if (isWrite) this.store80 = true;
				break;
			case SoftSwitches.RAMRDOFF:
				if (isWrite) this.ramRdAux = false;
				break;
			case SoftSwitches.RAMRDON:
				if (isWrite) this.ramRdAux = true;
				break;
			case SoftSwitches.RAMWRTOFF:
				if (isWrite) this.ramWrAux = false;
				break;
			case SoftSwitches.RAMWRTON:
				if (isWrite) this.ramWrAux = true;
				break;
			case SoftSwitches.ALTZPOFF:
				if (isWrite) this.altZp = false;
				break;
			case SoftSwitches.ALTZPON:
				if (isWrite) this.altZp = true;
				break;
			case SoftSwitches.INTCXROMOFF:
				if (isWrite) this.intCxRom = false;
				break;
			case SoftSwitches.INTCXROMON:
				if (isWrite) this.intCxRom = true;
				break;
			case SoftSwitches.SLOTC3ROMOFF:
				if (isWrite) this.slotC3Rom = false;
				break;
			case SoftSwitches.SLOTC3ROMON:
				if (isWrite) this.slotC3Rom = true;
				break;

			// Read switches / status flags
			case SoftSwitches.KBD:
				// Note: Writing to $C000 is STORE80OFF, handled above.
				if (!isWrite) return this.lastKey | (this.keyStrobe ? 0x80 : 0x00);
				break;
			case SoftSwitches.KBDSTRB:
				this.keyStrobe = false;
				return 0; // Return value is not defined
			case SoftSwitches.STORE80:
				if (!isWrite) return this.store80 ? 0x80 : 0x00;
				break;
			case SoftSwitches.RAMRD:
				if (!isWrite) return this.ramRdAux ? 0x80 : 0x00;
				break;
			case SoftSwitches.RAMWRT:
				if (!isWrite) return this.ramWrAux ? 0x80 : 0x00;
				break;
			case SoftSwitches.ALTZP:
				if (!isWrite) return this.altZp ? 0x80 : 0x00;
				break;
			case SoftSwitches.RDLCBNK2:
				if (!isWrite) return this.lcBank2 ? 0x80 : 0x00;
				break;
			case SoftSwitches.RDLCRAM:
				if (!isWrite) return this.lcReadRam ? 0x80 : 0x00;
				break;
			case SoftSwitches.INTCXROM:
				if (!isWrite) return this.intCxRom ? 0x80 : 0x00;
				break;
			case SoftSwitches.SLOTC3ROM:
				if (!isWrite) return this.slotC3Rom ? 0x80 : 0x00;
				break;
		}

		return 0;
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

	public pressKey(key: string) {
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
	}
}
