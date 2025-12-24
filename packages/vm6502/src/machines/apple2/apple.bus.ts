import type { DebugOption, IBus, MachineStateSpec } from "@/cpu/bus.interface";
import { MACHINE_STATE_OFFSET } from "@/cpu/shared-memory";
import type { ISlotCard } from "./slotcard.interface";
import { SmartPortCard } from "./smartport.card";
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
const APPLE_INTC8ROM_MASK = 0b1000_0000;

const RAM_OFFSET = 0x4000; // 16KB reserved for Bank2 (4KB) + ROM (12KB) at the beginning

// IIgs default colors - white on blue
const DEFAULT_TEXT_COLORS = 0xf2;

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

	// Slot System
	private slots: (ISlotCard | null)[] = new Array(8).fill(null);
	private activeExpansionSlot = 0;

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
	private intC8Rom = false; // Hardware hack for Slot 3 (Internal C800)
	private slotC3Rom = false; // false = Internal, true = Slot

	// Video State
	private col80 = false; // 80 Column Store/Display
	private altChar = false; // Alternate Character Set
	private text = true; // Text Mode
	private mixed = false; // Mixed Mode
	private page2 = false; // Page 2
	private hires = false; // Hi-Res Mode
	private tbColor = DEFAULT_TEXT_COLORS; // IIgs text/bg color (black bg, white text)

	// Keyboard State
	private lastKey = 0x00;
	private keyStrobe = false;

	// Game I/O / Pushbutton State
	private pb0 = false; // Open Apple (Left Alt)
	private pb1 = false; // Solid Apple (Right Alt)

	// Soft Switch Dispatch Tables (0xC000 - 0xC0FF)
	private readHandlers: Array<() => number> = new Array(256);
	private writeHandlers: Array<(val: number) => void> = new Array(256);

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
		this.installCard(5, new SmartPortCard(5, slot5Rom));

		this.setupSoftSwitches();
	}

	public installCard(slot: number, card: ISlotCard) {
		if (slot >= 1 && slot <= 7) {
			this.slots[slot] = card;
			if (this.registers && card.setRegisters) card.setRegisters(this.registers);
			if (card.setBus) card.setBus(this);
		}
	}

	public setRegistersView(view: DataView) {
		this.registers = view;
		this.slots.forEach((card) => {
			card?.setRegisters?.(view);
		});
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
		if (this.intC8Rom) byte2 |= APPLE_INTC8ROM_MASK;
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
		this.intC8Rom = false;
		this.slotC3Rom = false;

		this.col80 = false;
		this.altChar = false;
		this.text = true;
		this.mixed = false;
		this.page2 = false;
		this.hires = false;
		this.tbColor = DEFAULT_TEXT_COLORS;

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
			intC8Rom: (byte2 & APPLE_INTC8ROM_MASK) !== 0,
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
		this.lcReadRam = bit0 === bit1;

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

	private setupSoftSwitches() {
		// Initialize with default no-op/error handlers
		this.readHandlers.fill(() => 0);
		this.writeHandlers.fill(() => {});

		// Helper to register handlers
		const onRead = (addr: number, fn: () => number) => {
			this.readHandlers[addr & 0xff] = fn;
		};
		const onWrite = (addr: number, fn: (v: number) => void) => {
			this.writeHandlers[addr & 0xff] = fn;
		};

		// --- Keyboard ---
		onRead(SoftSwitches.KBD, () => this.lastKey | (this.keyStrobe ? 0x80 : 0x00));
		onRead(SoftSwitches.KBDSTRB, () => {
			this.keyStrobe = false;
			return 0;
		});
		onWrite(SoftSwitches.KBDSTRB, () => {
			this.keyStrobe = false;
		});

		// --- Video State Reads ---
		onRead(SoftSwitches.STORE80, () => (this.store80 ? 0x80 : 0x00));
		onRead(SoftSwitches.COL80, () => (this.col80 ? 0x80 : 0x00));
		onRead(SoftSwitches.ALTCHARSET, () => (this.altChar ? 0x80 : 0x00));
		onRead(SoftSwitches.TEXT, () => (this.text ? 0x80 : 0x00));
		onRead(SoftSwitches.MIXED, () => (this.mixed ? 0x80 : 0x00));
		onRead(SoftSwitches.PAGE2, () => (this.page2 ? 0x80 : 0x00));
		onRead(SoftSwitches.HIRES, () => (this.hires ? 0x80 : 0x00));
		onRead(SoftSwitches.TBCOLOR, () => this.tbColor);

		// --- Video State Writes ---
		onWrite(SoftSwitches.STORE80OFF, () => {
			this.store80 = false;
		});
		onWrite(SoftSwitches.STORE80ON, () => {
			this.store80 = true;
		});
		onWrite(SoftSwitches.COL80OFF, () => {
			this.col80 = false;
		});
		onWrite(SoftSwitches.COL80ON, () => {
			this.col80 = true;
		});
		onWrite(SoftSwitches.ALTCHARSETOFF, () => {
			this.altChar = false;
		});
		onWrite(SoftSwitches.ALTCHARSETON, () => {
			this.altChar = true;
		});
		onWrite(SoftSwitches.TEXTOFF, () => {
			this.text = false;
		});
		onWrite(SoftSwitches.TEXTON, () => {
			this.text = true;
		});
		onWrite(SoftSwitches.MIXEDOFF, () => {
			this.mixed = false;
		});
		onWrite(SoftSwitches.MIXEDON, () => {
			this.mixed = true;
		});
		onWrite(SoftSwitches.PAGE2OFF, () => {
			this.page2 = false;
		});
		onWrite(SoftSwitches.PAGE2ON, () => {
			this.page2 = true;
		});
		onWrite(SoftSwitches.HIRESOFF, () => {
			this.hires = false;
		});
		onWrite(SoftSwitches.HIRESON, () => {
			this.hires = true;
		});
		onWrite(SoftSwitches.TBCOLOR, (v) => {
			this.tbColor = v;
		});

		// Read-only switches that trigger state changes
		onRead(SoftSwitches.PAGE2OFF, () => {
			this.page2 = false;
			return 0;
		});
		onRead(SoftSwitches.PAGE2ON, () => {
			this.page2 = true;
			return 0;
		});
		onRead(SoftSwitches.HIRESOFF, () => {
			this.hires = false;
			return 0;
		});
		onRead(SoftSwitches.TEXTON, () => {
			this.text = true;
			return 0;
		});

		// --- Memory Management ---
		onRead(SoftSwitches.RAMRD, () => (this.ramRdAux ? 0x80 : 0x00));
		onRead(SoftSwitches.RAMWRT, () => (this.ramWrAux ? 0x80 : 0x00));
		onRead(SoftSwitches.ALTZP, () => (this.altZp ? 0x80 : 0x00));
		onRead(SoftSwitches.INTCXROM, () => (this.intCxRom ? 0x80 : 0x00));
		onRead(SoftSwitches.SLOTC3ROM, () => (this.slotC3Rom ? 0x80 : 0x00));
		onRead(SoftSwitches.RDLCBNK2, () => (this.lcBank2 ? 0x80 : 0x00));
		onRead(SoftSwitches.RDLCRAM, () => (this.lcReadRam ? 0x80 : 0x00));

		onWrite(SoftSwitches.RAMRDOFF, () => {
			this.ramRdAux = false;
		});
		onWrite(SoftSwitches.RAMRDON, () => {
			this.ramRdAux = true;
		});
		onWrite(SoftSwitches.RAMWRTOFF, () => {
			this.ramWrAux = false;
		});
		onWrite(SoftSwitches.RAMWRTON, () => {
			this.ramWrAux = true;
		});
		onWrite(SoftSwitches.ALTZPOFF, () => {
			this.altZp = false;
		});
		onWrite(SoftSwitches.ALTZPON, () => {
			this.altZp = true;
		});
		onWrite(SoftSwitches.INTCXROMOFF, () => {
			this.intCxRom = false;
		});
		onWrite(SoftSwitches.INTCXROMON, () => {
			this.intCxRom = true;
		});
		onWrite(SoftSwitches.SLOTC3ROMOFF, () => {
			this.slotC3Rom = false;
		});
		onWrite(SoftSwitches.SLOTC3ROMON, () => {
			this.slotC3Rom = true;
		});

		// --- Game I/O ---
		onRead(SoftSwitches.PB0, () => (this.pb0 ? 0x80 : 0x00));
		onRead(SoftSwitches.PB1, () => (this.pb1 ? 0x80 : 0x00));

		// --- Language Card ($C080-$C08F) ---
		// We register these in a loop to handle the echoes and specific addresses
		for (let addr = 0xc080; addr <= 0xc08f; addr++) {
			onRead(addr, () => {
				this.updateLcState(addr);
				return 0;
			});
			onWrite(addr, () => this.updateLcState(addr));
		}

		// --- Slot I/O ($C090-$C0FF) ---
		// Pre-calculate slot index to avoid bit-shifting at runtime
		for (let addr = 0xc090; addr <= 0xc0ff; addr++) {
			const slot = ((addr >> 4) & 0x0f) - 8;
			const offset = addr & 0x0f;
			onRead(addr, () => this.slots[slot]?.readIo(offset) ?? 0);
			onWrite(addr, (v) => this.slots[slot]?.writeIo(offset, v));
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
				break;
			case "slot.rom":
				if (data.length !== 0x100) {
					console.error("AppleBus: Load out of bounds: slot.rom should be $100 bytes");
					return;
				}
				if (address < 1 || address > 7) {
					console.error("AppleBus: Load out of bounds: slot.rom should be from 1 to 7");
					return;
				}
				this.slotRoms.set(data, (address - 1) * 0x100);
				console.log(`AppleBus: Loaded ${data.length} bytes into Slot ${address} ROM`);
				return;
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
			{ id: "intC8Rom", label: "Internal C8 ROM", type: "led", group: "Slot ROMs" },
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
			intC8Rom: this.intC8Rom,
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
		this.intC8Rom = state.intC8Rom ?? this.intC8Rom;
		this.slotC3Rom = state.slotC3Rom ?? this.slotC3Rom;
		this.col80 = state.col80 ?? this.col80;
		this.altChar = state.altChar ?? this.altChar;
		this.text = state.text ?? this.text;
		this.mixed = state.mixed ?? this.mixed;
		this.page2 = state.page2 ?? this.page2;
		this.hires = state.hires ?? this.hires;
	}

	public insertMedia(data: Uint8Array, metadata?: Record<string, unknown>) {
		if (metadata && typeof metadata.slot === "number") {
			const card = this.slots[metadata.slot];
			if (card?.insertMedia) card.insertMedia(data);
		}
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
