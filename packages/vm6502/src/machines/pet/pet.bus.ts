import { PIA6821, type PIASnapshot } from "@/machines/chips/pia6821";
import { VIA6522, type VIASnapshot } from "@/machines/chips/via6522";
import type { IBus, InterruptLines, KeyboardState, MachineStateSpec, TextMode } from "@/types/bus.interface";
import type { Dict } from "@/types/dict.type";
import { MACHINE_STATE_OFFSET1 } from "@/virtualmachine/cpu/shared-memory";
import {
	FRAME_CYCLES,
	keyForChar,
	keyForPcKey,
	keyForPetscii,
	PetKeyboard,
	type PetKey,
	type PetKeyboardSnapshot,
} from "./pet.keyboard";

/**
 * The memory map of the PET 3032 (BASIC 2), and where the bus keeps things in the machine's memory buffer:
 * the 64K the CPU sees, then the character ROM (the video reads it, the CPU doesn't).
 */
export const RAM_END = 0x8000; // 32K
export const SCREEN = 0x8000; // 1K, mirrored up to $8FFF
export const SCREEN_COLS = 40;
export const SCREEN_ROWS = 25;
const IO = 0xe800; // $E800-$E8FF
export const CHARGEN = 0x10000; // 2K: the graphics set, then the lower case set
export const PET_MEMORY_SIZE = CHARGEN + 0x800;

/** The editor's keyboard buffer count (BASIC 2): typed keys wait until it's empty. */
const KEY_COUNT = 0x9e;

/** 200 lines of 64 cycles shown, then the vertical retrace (60 lines): the IRQ, once a frame. */
const DISPLAY_CYCLES = 200 * 64;

/** Shared state byte (MACHINE_STATE_OFFSET1): the character set the VIA's CA2 selects. */
export const PET_LOWERCASE_MASK = 0x01;

type PetSnapshot = {
	pia1: PIASnapshot;
	pia2: PIASnapshot;
	via: VIASnapshot;
	keyboard: PetKeyboardSnapshot;
	frameCycle: number;
};

/**
 * The Commodore PET 3032: 32K of RAM, the 40x25 screen at $8000, BASIC 2 at $C000, the editor at $E000, the
 * kernal at $F000, and the I/O page $E8xx where the address bits A4 / A5 / A6 select:
 * - PIA1 ($E810): keyboard (row out on port A bits 0-3, columns in on port B), the vertical retrace on CB1 (the
 *   60 Hz IRQ that scans the keyboard, updates the clock and blinks the cursor), cassette, diagnostic sense.
 * - PIA2 ($E820): the IEEE-488 data lines (no device here: "?DEVICE NOT PRESENT").
 * - VIA ($E840): IEEE-488 handshake, user port, retrace (PB5), timers, character set (CA2: POKE 59468,14 lower
 *   case, 12 graphics).
 *
 * Unmapped addresses read as their high byte (the data bus floats).
 */
export class PetBus implements IBus {
	private readonly memory: Uint8Array;
	private readonly pia1: PIA6821;
	private readonly pia2: PIA6821;
	private readonly via: VIA6522;
	private readonly keyboard = new PetKeyboard();
	private lines: InterruptLines | null = null;
	private irqActive = false;
	private registers: DataView | null = null;

	/** Cycles since the frame started (the end of the retrace). */
	private frameCycle = 0;
	/** The character set, from the shared state (main thread). */
	private lowercaseShown = false;

	constructor(memory: Uint8Array) {
		this.memory = memory;
		const updateIrq = () => this.updateIrq();
		this.pia1 = new PIA6821({
			readPortA: () => 0xff, // diagnostic sense high (no monitor at reset), no cassette key, EOI up
			readPortB: () => this.keyboard.columns(this.pia1.outputA & 0x0f),
			irq: updateIrq,
		});
		this.pia2 = new PIA6821({ irq: updateIrq }); // IEEE-488 data in: all lines up
		this.via = new VIA6522({
			// IEEE handshake lines up (no device), PB5: low in the retrace
			readPortB: () => (this.inRetrace ? 0xdf : 0xff),
			irq: updateIrq,
		});
	}

	private get inRetrace() {
		return this.frameCycle >= DISPLAY_CYCLES;
	}

	/** CA2 high (PCR bits 3-1 = 111): the lower / upper case set; low (110): upper case / graphics. */
	get lowercase(): boolean {
		return ((this.via.peek(0x0c) >> 1) & 7) === 7;
	}

	setInterruptLines(lines: InterruptLines) {
		this.lines = lines;
		this.irqActive = false;
		this.updateIrq();
	}

	private updateIrq() {
		const active = this.pia1.irq || this.pia2.irq || this.via.irq;
		if (active === this.irqActive) return;
		this.irqActive = active;
		this.lines?.irq(active);
	}

	reset() {
		this.pia1.reset();
		this.pia2.reset();
		this.via.reset();
		this.frameCycle = 0;
		this.keyboard.reset();
		this.updateIrq();
		this.syncState();
	}

	tick(cycles: number) {
		this.via.tick(cycles);
		const before = this.frameCycle;
		this.frameCycle += cycles;
		if (before < DISPLAY_CYCLES && this.frameCycle >= DISPLAY_CYCLES) {
			this.pia1.pulseCB1();
			this.keyboard.frame(this.memory[KEY_COUNT] === 0);
		}
		if (this.frameCycle >= FRAME_CYCLES) this.frameCycle -= FRAME_CYCLES;
	}

	read(address: number, _isOpcodeFetch?: boolean): number {
		if (address < RAM_END) return this.memory[address] as number;
		if (address < 0x9000) return this.memory[SCREEN | (address & 0x3ff)] as number;
		if (address >= 0xc000) {
			if (address < IO || address >= 0xf000) return this.memory[address] as number;
			if (address < 0xe900) return this.ioRead(address);
		}
		return address >> 8;
	}

	private ioRead(address: number): number {
		if (address & 0x10) return this.pia1.read(address);
		if (address & 0x20) return this.pia2.read(address);
		if (address & 0x40) return this.via.read(address & 0x0f);
		return address >> 8;
	}

	write(address: number, value: number): void {
		if (address < RAM_END) this.memory[address] = value & 0xff;
		else if (address < 0x9000) this.memory[SCREEN | (address & 0x3ff)] = value & 0xff;
		else if (address >= IO && address < 0xe900) {
			// Each chip whose select line is up takes the write
			if (address & 0x10) this.pia1.write(address, value);
			if (address & 0x20) this.pia2.write(address, value);
			if (address & 0x40) this.via.write(address & 0x0f, value & 0xff);
		}
	}

	readDebug(address: number): number {
		address &= 0xffff;
		if (address >= IO && address < 0xe900) {
			if (address & 0x10) return this.pia1.peek(address);
			if (address & 0x20) return this.pia2.peek(address);
			if (address & 0x40) return this.via.peek(address & 0x0f);
			return address >> 8;
		}
		return this.read(address);
	}

	peek(address: number): number {
		return this.readDebug(address);
	}

	readDebugRange(address: number, length: number): Uint8Array {
		const bytes = new Uint8Array(length);
		for (let i = 0; i < length; i++) bytes[i] = this.readDebug(address + i);
		return bytes;
	}

	/** RAM, screen, and the ROMs too (patching them); not the I/O page. */
	writeDebug(address: number, value: number): void {
		address &= 0xffff;
		if (address >= IO && address < 0xe900) return;
		if (address >= SCREEN && address < 0x9000) address = SCREEN | (address & 0x3ff);
		this.memory[address] = value & 0xff;
	}

	load(address: number, data: Uint8Array, _bank?: number, _tag?: string) {
		this.memory.set(data, address);
	}

	ioWrite(_address: number, _value: number, _worker: Worker) {}
	registerTickHandler(_handler: (cycles: number) => void) {}
	unregisterTickHandler(_handler: (cycles: number) => void) {}

	search(
		pattern: (number | null)[],
		startAddress: number,
		endAddress = 0xffff,
		is7Bit = false,
		candidates?: number[][],
	): { address: number; location: string }[] {
		const results: { address: number; location: string }[] = [];
		const end = Math.min(endAddress, 0xffff) - pattern.length + 1;
		for (let address = Math.max(0, startAddress); address <= end; address++) {
			let wildcard = 0;
			const match = pattern.every((expected, i) => {
				const byte = this.readDebug(address + i) & (is7Bit ? 0x7f : 0xff);
				if (expected === null) {
					const allowed = candidates?.[wildcard++];
					return allowed === undefined || allowed.includes(byte);
				}
				return byte === (is7Bit ? expected & 0x7f : expected);
			});
			if (match) results.push({ address, location: regionName(address) });
		}
		return results;
	}

	// --- Keyboard ---

	pressKey(key: string, code?: string, ctrl?: boolean, shift?: boolean, _alt?: boolean, meta?: boolean) {
		if (ctrl || meta) return;
		const petKey = keyForPcKey(key, !!shift);
		if (petKey) this.keyboard.press(code || key, petKey);
	}

	releaseKey(key?: string, code?: string) {
		this.keyboard.release(key === undefined && code === undefined ? undefined : code || key);
	}

	typeText(text: string) {
		const keys: PetKey[] = [];
		let skipped = 0;
		const chars = text.replace(/\r\n/g, "\n");
		for (const char of chars) {
			const key = keyForChar(char);
			if (key) keys.push(key);
			else skipped++;
		}
		this.keyboard.type(keys);
		return { queued: keys.length, skipped };
	}

	/** A character, or a PETSCII code (bit 7: shifted). */
	holdKey(key: string | number | null) {
		if (key === null) return this.keyboard.hold(null);
		const petKey = typeof key === "number" ? keyForPetscii(key) : keyForChar(key);
		if (!petKey) throw new Error(`No PET key for ${JSON.stringify(key)}`);
		this.keyboard.hold(petKey, typeof key === "number" ? key : key.charCodeAt(0));
	}

	clearKeys() {
		this.keyboard.clear();
	}

	/** Cycles a typed key stays up before the next one (rounded up to frames, at least one). */
	setKeyDelay(cycles: number) {
		this.keyboard.keyDelay = cycles;
	}

	getKeyboardState(): KeyboardState {
		return this.keyboard.state();
	}

	// --- Screen ---

	getTextScreen(): string[] {
		const lowercase = this.registers ? this.lowercase : this.lowercaseShown;
		const rows: string[] = [];
		for (let row = 0; row < SCREEN_ROWS; row++) {
			let line = "";
			for (let col = 0; col < SCREEN_COLS; col++)
				line += screenCodeToChar(this.memory[SCREEN + row * SCREEN_COLS + col] as number, lowercase);
			rows.push(line);
		}
		return rows;
	}

	getTextMode(): TextMode {
		return { page: 1, cols: 40, shown: "full" };
	}

	// --- State shared with the main thread and the UI ---

	setRegistersView(view: DataView) {
		this.registers = view;
	}

	syncState() {
		this.registers?.setUint8(MACHINE_STATE_OFFSET1, this.lowercase ? PET_LOWERCASE_MASK : 0);
	}

	syncStateFromBuffer(view: DataView): Dict {
		this.lowercaseShown = (view.getUint8(MACHINE_STATE_OFFSET1) & PET_LOWERCASE_MASK) !== 0;
		return { lowercase: this.lowercaseShown };
	}

	getMachineStateSpecs(): MachineStateSpec[] {
		return [{ id: "lowercase", label: "Lower case", type: "led", group: "Video" }];
	}

	snapshot(): PetSnapshot {
		return {
			pia1: this.pia1.snapshot(),
			pia2: this.pia2.snapshot(),
			via: this.via.snapshot(),
			keyboard: this.keyboard.snapshot(),
			frameCycle: this.frameCycle,
		};
	}

	restoreSnapshot(state: unknown) {
		const s = state as PetSnapshot;
		this.pia1.restoreSnapshot(s.pia1);
		this.pia2.restoreSnapshot(s.pia2);
		this.via.restoreSnapshot(s.via);
		this.keyboard.restoreSnapshot(s.keyboard);
		this.frameCycle = s.frameCycle;
		this.updateIrq();
		this.syncState();
	}
}

function regionName(address: number): string {
	if (address < RAM_END) return "RAM";
	if (address < 0x9000) return "SCREEN";
	if (address >= 0xc000 && address < IO) return "ROM";
	if (address >= 0xf000) return "ROM";
	return "IO";
}

/**
 * A screen code as text. 0x00-0x3F: @, the letters (lower case in the lower case set), [ \ ] ↑ ←, then space to
 * ?. 0x40-0x7F: the graphics characters, or the upper case letters in the lower case set. Bit 7: reverse video.
 */
export function screenCodeToChar(screenCode: number, lowercase: boolean): string {
	const code = screenCode & 0x7f;
	if (code === 0x00) return "@";
	if (code <= 0x1a) return String.fromCharCode((lowercase ? 0x60 : 0x40) + code);
	if (code < 0x20) return "[\\]↑←"[code - 0x1b] as string;
	if (code < 0x40) return String.fromCharCode(code);
	if (lowercase && code >= 0x41 && code <= 0x5a) return String.fromCharCode(code);
	if (code === 0x60) return " "; // shifted space
	return "▒";
}
