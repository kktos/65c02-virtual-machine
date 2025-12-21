import type { DebugOption, IBus } from "@/cpu/bus.interface";
import * as SoftSwitches from "./softswitches";

const RAM_OFFSET = 0x4000; // 16KB reserved for Bank2 (4KB) + ROM (12KB) at the beginning

export class AppleBus implements IBus {
	private memory: Uint8Array;
	// Private storage for the system ROM ($D000-$FFFF)
	private rom: Uint8Array;
	// Private storage for Language Card Bank 2 RAM ($D000-$DFFF)
	private bank2: Uint8Array;

	// Language Card State
	private lcBank2 = false; // false = Bank 1 ($D000), true = Bank 2 ($D000)
	private lcReadRam = false; // false = Read ROM, true = Read RAM
	private lcWriteRam = false; // false = Write Protect, true = Write Enable
	private lcPreWriteCount = 0; // Counter for the double-read write enable mechanism

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
	}

	read(address: number): number {
		// Softswitches ($C000 - $C0FF)
		if (address >= 0xc000 && address <= 0xc0ff) {
			return this.accessSoftSwitch(address, null);
		}

		// Language Card Range ($D000 - $FFFF)
		if (address >= 0xd000) {
			// Reset pre-write count on non-switch access
			this.lcPreWriteCount = 0;

			if (this.lcReadRam) {
				// Reading RAM
				if (this.lcBank2 && address < 0xe000) {
					// Bank 2 ($D000-$DFFF)
					return this.bank2[address - 0xd000] ?? 0;
				}
				// Bank 1 ($D000-$DFFF) or High RAM ($E000-$FFFF)
				// Mapped to physical RAM at same address
				return this.memory[RAM_OFFSET + address] ?? 0;
			}
			// Reading ROM
			return this.rom[address - 0xd000] ?? 0;
		}

		// Standard RAM
		this.lcPreWriteCount = 0;
		return this.memory[RAM_OFFSET + address] ?? 0;
	}

	write(address: number, value: number): void {
		// Softswitches ($C000 - $C0FF)
		if (address >= 0xc000 && address <= 0xc0ff) {
			this.accessSoftSwitch(address, value);
			return;
		}

		// Language Card Range ($D000 - $FFFF)
		if (address >= 0xd000) {
			this.lcPreWriteCount = 0;
			if (this.lcWriteRam) {
				if (this.lcBank2 && address < 0xe000) {
					this.bank2[address - 0xd000] = value & 0xff;
				} else {
					this.memory[RAM_OFFSET + address] = value & 0xff;
				}
			}
			return;
		}

		// Standard RAM
		this.lcPreWriteCount = 0;
		this.memory[RAM_OFFSET + address] = value & 0xff;
	}

	private accessSoftSwitch(address: number, writeValue: number | null): number {
		const switchAddr = address & 0xc0ff;
		const isWrite = writeValue !== null;

		// Language Card Switches ($C080 - $C08F)
		if (switchAddr >= SoftSwitches.LCRAMIN2 && switchAddr <= SoftSwitches.LC_C08F) {
			const bit0 = (switchAddr & 1) !== 0; // 0=Read RAM/ROM, 1=Write RAM (maybe)
			const bit1 = (switchAddr & 2) !== 0; // 0=Read RAM/ROM, 1=Read ROM
			const bit3 = (switchAddr & 8) !== 0; // 0=Bank 2, 1=Bank 1

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

		// Keyboard ($C000, $C010)
		if (switchAddr === SoftSwitches.KBD) {
			if (!isWrite) {
				// Read: Return last key with strobe bit (bit 7)
				return this.lastKey | (this.keyStrobe ? 0x80 : 0x00);
			}
			// Write: $C000 is STORE80OFF (TODO)
		}

		if (switchAddr === SoftSwitches.KBDSTRB) {
			// Read or Write clears the strobe
			this.keyStrobe = false;
			return 0;
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
		}

		// Default load to physical RAM
		// Handle Bank 1 (Aux) offset if bank=1
		const physicalAddress = RAM_OFFSET + address + bank * 0x10000;
		if (physicalAddress + data.length <= this.memory.length) {
			this.memory.set(data, physicalAddress);
			console.log(`AppleBus: Loaded ${data.length} bytes into RAM at $${physicalAddress.toString(16)}`);
		} else {
			console.error(`AppleBus: Load out of bounds: 0x${physicalAddress.toString(16)}`);
		}
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

		if (address < 0xc000) return this.memory[RAM_OFFSET + address] ?? 0;

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
				label: "ROM",
				type: "select",
				options: [
					{ label: "Auto", value: "AUTO" },
					{ label: "ROM", value: "ROM" },
					{ label: "LC Bank 1", value: "BANK1" },
					{ label: "LC Bank 2", value: "BANK2" },
				],
			},
		];
	}
}
