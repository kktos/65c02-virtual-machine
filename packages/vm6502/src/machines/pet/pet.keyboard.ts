import type { KeyboardState } from "@/types/bus.interface";

/**
 * The graphics ("N") keyboard matrix: [row][column] → the PETSCII code the editor ROM gives it unshifted.
 * The row is selected by PIA1 port A bits 0-3, the columns read on PIA1 port B (a key down pulls its bit low).
 * 0x00: a shift key, 0xFF: no key. Shift + a key gives its code with bit 7 set (graphics, cursor up / left…).
 * From the editor ROM's scan table (BASIC 2, 901447-24, $E6F8: read from the end, row 0 / column 0 last).
 */
export const PET_KEY_MATRIX: readonly (readonly number[])[] = [
	[0x21, 0x23, 0x25, 0x26, 0x28, 0x5f, 0x13, 0x1d], // ! # % & ( ← HOME →
	[0x22, 0x24, 0x27, 0x5c, 0x29, 0xff, 0x11, 0x14], // " $ ' \ ) . ↓ DEL
	[0x51, 0x45, 0x54, 0x55, 0x4f, 0x5e, 0x37, 0x39], // Q E T U O ↑ 7 9
	[0x57, 0x52, 0x59, 0x49, 0x50, 0xff, 0x38, 0x2f], // W R Y I P . 8 /
	[0x41, 0x44, 0x47, 0x4a, 0x4c, 0xff, 0x34, 0x36], // A D G J L . 4 6
	[0x53, 0x46, 0x48, 0x4b, 0x3a, 0xff, 0x35, 0x2a], // S F H K : . 5 *
	[0x5a, 0x43, 0x42, 0x4d, 0x3b, 0x0d, 0x31, 0x33], // Z C B M ; RETURN 1 3
	[0x58, 0x56, 0x4e, 0x2c, 0x3f, 0xff, 0x32, 0x2b], // X V N , ? . 2 +
	[0x00, 0x40, 0x5d, 0xff, 0x3e, 0x00, 0x30, 0x2d], // LSHIFT @ ] . > RSHIFT 0 -
	[0x12, 0x5b, 0x20, 0x3c, 0x03, 0xff, 0x2e, 0x3d], // RVS [ SPACE < STOP . . =
];

/** A key of the matrix, with or without shift. */
export type PetKey = { row: number; col: number; shift: boolean };

const LEFT_SHIFT = { row: 8, col: 0 };

const RETURN = 0x0d;
const DEL = 0x14;
const CRSR_DOWN = 0x11;
const CRSR_RIGHT = 0x1d;
const HOME = 0x13;
const RUN_STOP = 0x03;
const RVS = 0x12;

const KEY_BY_CODE = new Map<number, PetKey>();
PET_KEY_MATRIX.forEach((columns, row) =>
	columns.forEach((code, col) => {
		if (code === 0x00 || code === 0xff || KEY_BY_CODE.has(code)) return; // the first one (not the keypad's)
		KEY_BY_CODE.set(code, { row, col, shift: false });
	}),
);

/** The key (and shift) giving the PETSCII `code`: bit 7 set is the shifted key. */
export function keyForPetscii(code: number): PetKey | undefined {
	const key = KEY_BY_CODE.get(code & 0x7f);
	return key && { ...key, shift: (code & 0x80) !== 0 };
}

/**
 * The key for a typed (ASCII) character: letters of either case are the unshifted letter keys (upper case on
 * the PET's screen, the commands BASIC knows), `\n` / `\r` RETURN. Undefined: no key gives it.
 */
export function keyForChar(char: string): PetKey | undefined {
	if (char === "\n" || char === "\r") return keyForPetscii(RETURN);
	const code = char.charCodeAt(0);
	if (code >= 0x61 && code <= 0x7a) return keyForPetscii(code - 0x20);
	if (code >= 0x20 && code < 0x60) return keyForPetscii(code);
	return undefined;
}

/** The PC keys without a character (KeyboardEvent.key) → the PET key. */
const SPECIAL_KEYS: Record<string, number> = {
	Enter: RETURN,
	Backspace: DEL,
	Delete: DEL,
	Insert: DEL | 0x80,
	ArrowDown: CRSR_DOWN,
	ArrowUp: CRSR_DOWN | 0x80,
	ArrowRight: CRSR_RIGHT,
	ArrowLeft: CRSR_RIGHT | 0x80,
	Home: HOME,
	End: HOME | 0x80, // CLR
	Escape: RUN_STOP,
	Tab: RVS,
};

/**
 * A PC key (KeyboardEvent.key) → the PET key, by the character it types: `!` is the PET's `!` key, whatever the PC
 * needs to type it. Letters typed with shift are the PET's shifted letters (the graphics characters).
 */
export function keyForPcKey(key: string, shift: boolean): PetKey | undefined {
	const special = SPECIAL_KEYS[key];
	if (special !== undefined) return keyForPetscii(special);
	if (key.length !== 1) return undefined;
	const petKey = keyForChar(key);
	if (petKey && /[a-z]/i.test(key)) petKey.shift = shift;
	return petKey;
}

/** Frames a typed key stays down: the editor scans the keyboard once a frame (the 60 Hz IRQ). */
const TYPED_DOWN_FRAMES = 2;
/** Frames a real key stays down at least, however quickly it's released (the first frame may be cut short). */
const KEY_DOWN_FRAMES = 2;
/** At 1 MHz. */
export const FRAME_CYCLES = 16_640;

/** What a save state keeps of the keyboard. Not the real keys down. */
export type PetKeyboardSnapshot = {
	queue: PetKey[];
	typed: PetKey | null;
	framesLeft: number;
	held: PetKey | null;
	heldCode: number | null;
};

/**
 * The PET keyboard: the matrix as the keys down make it (the real keys, the key held, the key being typed).
 *
 * Typed keys (paste, `type_keys`) go down one at a time, for 2 frames, then up for `keyDelay` (at least 1
 * frame: the same key twice needs a scan with it up). The next one waits for the editor's keyboard buffer to be
 * empty, so a program busy for a while doesn't lose keys (the buffer has room for 10).
 */
export class PetKeyboard {
	public keyDelay = FRAME_CYCLES;

	private keysDown = new Map<string, PetKey>();
	/** The real keys' events not applied yet (`key`: down, none: up), and the frames before the next one. */
	private keyEvents: { physicalKey: string; key?: PetKey }[] = [];
	private keyEventWait = 0;
	private queue: PetKey[] = [];
	private typed: PetKey | null = null;
	/** Frames the typed key stays down (typed), or the next one waits (no typed key). */
	private framesLeft = 0;
	private held: PetKey | null = null;
	private heldCode: number | null = null;
	private lastCode = 0;

	/** Port B for the row selected (0-9; others: no row): a key down pulls its column's bit low. */
	columns(row: number): number {
		if (row > 9) return 0xff;
		let bits = 0xff;
		const press = (key: PetKey | null) => {
			if (!key) return;
			if (key.row === row) bits &= ~(1 << key.col);
			if (key.shift && LEFT_SHIFT.row === row) bits &= ~(1 << LEFT_SHIFT.col);
		};
		for (const key of this.keysDown.values()) press(key);
		press(this.typed);
		press(this.held);
		return bits;
	}

	/** Once a frame (the vertical retrace): the typing goes on. `bufferEmpty`: the editor took the last key. */
	frame(bufferEmpty: boolean) {
		if (this.keyEventWait > 0) {
			this.keyEventWait--;
			this.applyKeyEvents();
		}

		if (this.framesLeft > 0) this.framesLeft--;
		if (this.framesLeft > 0) return;
		if (this.typed) {
			this.typed = null;
			this.framesLeft = Math.max(1, Math.ceil(this.keyDelay / FRAME_CYCLES));
			return;
		}
		if (!bufferEmpty) return;
		const next = this.queue.shift();
		if (!next) return;
		this.typed = next;
		this.framesLeft = TYPED_DOWN_FRAMES;
		this.lastCode = PET_KEY_MATRIX[next.row]?.[next.col] ?? 0;
	}

	/** A real key down. A key already down (the browser's auto-repeat) changes nothing. */
	press(physicalKey: string, key: PetKey) {
		const last = this.lastEventFor(physicalKey);
		if (last ? last.down : this.keysDown.has(physicalKey)) return;
		this.keyEvents.push({ physicalKey, key });
		this.applyKeyEvents();
	}

	/** A real key up. No key: all the keys are up now (the page lost the focus: their keyup won't come). */
	release(physicalKey?: string) {
		if (physicalKey === undefined) {
			this.keysDown.clear();
			this.keyEvents.length = 0;
			this.keyEventWait = 0;
			return;
		}
		const last = this.lastEventFor(physicalKey);
		if (!(last ? last.down : this.keysDown.has(physicalKey))) return;
		this.keyEvents.push({ physicalKey });
		this.applyKeyEvents();
	}

	private lastEventFor(physicalKey: string) {
		const events = this.keyEvents.filter((event) => event.physicalKey === physicalKey);
		const last = events[events.length - 1];
		return last && { down: last.key !== undefined };
	}

	/**
	 * The real keys' events, in order, as fast as the scans see them: a key goes down for at least
	 * KEY_DOWN_FRAMES frames, and up for a frame before the next event. A quick tap (the key up before any
	 * scan, or both events in the same time slice of the worker) isn't lost, nor fast typing.
	 */
	private applyKeyEvents() {
		while (this.keyEventWait === 0) {
			const event = this.keyEvents.shift();
			if (!event) return;
			if (event.key) {
				this.keysDown.set(event.physicalKey, event.key);
				this.lastCode = PET_KEY_MATRIX[event.key.row]?.[event.key.col] ?? 0;
				this.keyEventWait = KEY_DOWN_FRAMES;
			} else {
				this.keysDown.delete(event.physicalKey);
				this.keyEventWait = 1;
			}
		}
	}

	type(keys: PetKey[]) {
		this.queue.push(...keys);
	}

	hold(key: PetKey | null, code: number | null = null) {
		this.held = key;
		this.heldCode = key ? code : null;
	}

	clear() {
		this.queue.length = 0;
	}

	/** The typing restarts (the keys typed so far stay queued); the real keys stay down. */
	reset() {
		this.typed = null;
		this.framesLeft = 0;
	}

	state(): KeyboardState {
		return {
			queued: this.queue.length + (this.typed ? 1 : 0),
			held: this.heldCode,
			delay: this.keyDelay,
			latch: this.lastCode,
			strobe: false,
			keyDown: this.keysDown.size > 0 || this.keyEvents.length > 0 || this.typed !== null || this.held !== null,
		};
	}

	snapshot(): PetKeyboardSnapshot {
		return {
			queue: this.queue.map((key) => ({ ...key })),
			typed: this.typed && { ...this.typed },
			framesLeft: this.framesLeft,
			held: this.held && { ...this.held },
			heldCode: this.heldCode,
		};
	}

	restoreSnapshot(state: PetKeyboardSnapshot | undefined) {
		this.queue = state?.queue.map((key) => ({ ...key })) ?? [];
		this.typed = state?.typed ?? null;
		this.framesLeft = state?.framesLeft ?? 0;
		this.held = state?.held ?? null;
		this.heldCode = state?.heldCode ?? null;
	}
}
