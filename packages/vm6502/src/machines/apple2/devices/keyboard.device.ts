import type { KeyboardState } from "@/types/bus.interface";
import type { AppleBus } from "../apple.bus";
import type { AppleKeyboardDevice } from "./device.interface";

/** Cycles after a strobe clear before the next typed key is given to the program: about 10 ms at 1 MHz. */
export const DEFAULT_KEY_DELAY = 10_000;
/** A held key repeats after about half a second, then 15 times a second (the //e's auto-repeat). */
const REPEAT_DELAY = 512_000;
const REPEAT_PERIOD = 68_000;

/** The host's keys that aren't characters, to the //e's codes. */
const SPECIAL_KEYS = new Map([
	["Enter", 0x0d],
	["Backspace", 0x08],
	["ArrowLeft", 0x08], // Apple II Left is BS
	["ArrowRight", 0x15], // Apple II Right is NAK
	["ArrowUp", 0x0b],
	["ArrowDown", 0x0a],
	["Escape", 0x1b],
]);
/** The host's keys for the Apple keys. */
const OPEN_APPLE_KEY = "AltLeft";
const SOLID_APPLE_KEY = "AltRight";

/** What a save state keeps of the keyboard. Not the real keys down. */
export type KeyboardSnapshot = {
	/** Absent from the states saved before the keyboard device (they had them in the bus's fields). */
	latch?: number;
	strobe?: boolean;
	openApple?: boolean;
	solidApple?: boolean;
	queue: number[];
	held: number;
	typedDown: boolean;
	strobeClearedAt: number;
	nextRepeatAt: number;
};

/**
 * The //e keyboard, a device (conf/devices.conf.ts): the latch ($C000-$C00F: the last key, bit 7 the strobe), the
 * strobe clear ($C010, which reads AKD, "a key is down", in bit 7), the Open and Solid Apple keys, the keys down,
 * and the keys typed by software (paste, `type_keys`, the `key` command).
 *
 * The typed keys wait in a queue, paced by the program: the next one is latched when the program reads $C000 with
 * the strobe clear, `keyDelay` cycles or more after it consumed the previous one (cleared the strobe). A program
 * that flushes the keyboard (STA $C010) some time after reading a key eats the next one if it was already there:
 * a longer delay avoids it, a shorter one types faster. 0 gives the next key as soon as the program asks.
 */
export class AppleKeyboard implements AppleKeyboardDevice {
	public latch = 0;
	public strobe = false;
	public keyDelay = DEFAULT_KEY_DELAY;
	public openApple = false;
	public solidApple = false;

	private queue: number[] = [];
	/** The key held by `hold` (-1: none): down, and repeating. */
	private held = -1;
	/** A typed key is down from when it's latched until the program clears the strobe. */
	private typedDown = false;
	/** The real keys down (KeyboardEvent.code), for AKD. */
	private keysDown = new Set<string>();
	private strobeClearedAt = 0;
	private nextRepeatAt = 0;

	private readonly bus: Pick<AppleBus, "totalCycles">;

	constructor({ bus }: { bus: Pick<AppleBus, "totalCycles"> }) {
		this.bus = bus;
	}

	private now() {
		return this.bus.totalCycles;
	}

	get anyKeyDown() {
		return this.typedDown || this.held >= 0 || this.keysDown.size > 0;
	}

	// --- Soft switches ---

	/** $C000-$C00F: the latch; $C010: AKD, and clears the strobe. */
	readSwitch(address: number): number {
		return (address & 0xf0) === 0x10 ? this.readStrobe() : this.readData();
	}

	/** $C010 */
	writeSwitch() {
		this.clearStrobe();
	}

	/** $C000 */
	readData(): number {
		if (!this.strobe) this.feed();
		return this.latch | (this.strobe ? 0x80 : 0x00);
	}

	/** $C010 read: AKD and the latch, then clears the strobe. */
	readStrobe(): number {
		const value = this.latch | (this.anyKeyDown ? 0x80 : 0x00);
		this.clearStrobe();
		return value;
	}

	/** $C010 write / read. Only a strobe that was set starts the delay: polling AKD doesn't hold the queue back. */
	clearStrobe() {
		if (this.strobe) {
			this.strobe = false;
			this.strobeClearedAt = this.now();
		}
		this.typedDown = false;
	}

	// --- The host's keys (IBus) ---

	/** A key pressed on the host (KeyboardEvent `key` and `code`): an Apple key, or a key latched. */
	pressKey(key: string, code?: string, ctrl?: boolean) {
		if (code === OPEN_APPLE_KEY) {
			this.openApple = true;
			return;
		}
		if (code === SOLID_APPLE_KEY) {
			this.solidApple = true;
			return;
		}
		let ascii = SPECIAL_KEYS.get(key) ?? 0;
		if (key.length === 1) {
			ascii = key.charCodeAt(0);
			if (ctrl) ascii &= 0x1f;
		}
		if (ascii > 0 && ascii < 0x80) this.press(ascii, code ?? key);
	}

	/** A key released on the host. With no key, all the keys are up (the page lost the focus). */
	releaseKey(key?: string, code?: string) {
		if (key === undefined && code === undefined) {
			this.releaseAll();
			this.openApple = false;
			this.solidApple = false;
			return;
		}
		if (code === OPEN_APPLE_KEY) this.openApple = false;
		else if (code === SOLID_APPLE_KEY) this.solidApple = false;
		else this.release(code ?? (key as string));
	}

	typeText(text: string) {
		const { codes, skipped } = textToKeyCodes(text);
		this.type(codes);
		return { queued: codes.length, skipped };
	}

	/** Holds a key down (the first character of `key`, or a key code), or releases it (null). */
	holdKey(key: string | number | null) {
		if (key === null) return this.hold(-1);
		const code = typeof key === "number" ? key & 0x7f : textToKeyCodes(key).codes[0];
		if (code === undefined) throw new Error(`No key for ${JSON.stringify(key)}`);
		this.hold(code);
	}

	clearKeys() {
		this.queue.length = 0;
	}

	setKeyDelay(cycles: number) {
		this.keyDelay = Math.max(0, Math.round(cycles));
	}

	getKeyboardState(): KeyboardState {
		return {
			queued: this.queue.length,
			held: this.held < 0 ? null : this.held,
			delay: this.keyDelay,
			latch: this.latch,
			strobe: this.strobe,
			keyDown: this.anyKeyDown,
		};
	}

	// --- The keys, as codes ---

	/** A real key pressed: latched now, and it interrupts the typing under way. */
	press(code: number, physicalKey?: string) {
		this.queue.length = 0;
		this.typedDown = false;
		this.setLatch(code);
		if (physicalKey) this.keysDown.add(physicalKey);
	}

	release(physicalKey: string) {
		this.keysDown.delete(physicalKey);
	}

	/** The real keys are all up (the page lost the focus: their keyup won't come). */
	releaseAll() {
		this.keysDown.clear();
	}

	type(codes: number[]) {
		this.queue.push(...codes);
	}

	/** Holds a key down (latched now, then repeating), or releases it (-1). */
	hold(code: number) {
		this.held = code;
		if (code < 0) return;
		this.setLatch(code);
		this.nextRepeatAt = this.now() + REPEAT_DELAY;
	}

	/**
	 * The cycle counter restarts at 0: the times kept would hold the keys back. The keys stay (a reset doesn't lift
	 * them), but the Apple keys are let go.
	 */
	reset() {
		this.strobeClearedAt = 0;
		this.nextRepeatAt = 0;
		this.openApple = false;
		this.solidApple = false;
	}

	snapshot(): KeyboardSnapshot {
		return {
			latch: this.latch,
			strobe: this.strobe,
			openApple: this.openApple,
			solidApple: this.solidApple,
			queue: [...this.queue],
			held: this.held,
			typedDown: this.typedDown,
			strobeClearedAt: this.strobeClearedAt,
			nextRepeatAt: this.nextRepeatAt,
		};
	}

	restoreSnapshot(snapshot: unknown) {
		const state = snapshot as Partial<KeyboardSnapshot> | undefined;
		this.latch = state?.latch ?? 0;
		this.strobe = state?.strobe ?? false;
		this.openApple = state?.openApple ?? false;
		this.solidApple = state?.solidApple ?? false;
		this.queue = [...(state?.queue ?? [])];
		this.held = state?.held ?? -1;
		this.typedDown = state?.typedDown ?? false;
		this.strobeClearedAt = state?.strobeClearedAt ?? 0;
		this.nextRepeatAt = state?.nextRepeatAt ?? 0;
	}

	private setLatch(code: number) {
		this.latch = code & 0x7f;
		this.strobe = true;
	}

	private feed() {
		const now = this.now();
		if (this.queue.length > 0) {
			if (now - this.strobeClearedAt < this.keyDelay) return;
			this.setLatch(this.queue.shift() as number);
			this.typedDown = true;
			return;
		}
		if (this.held >= 0 && now >= this.nextRepeatAt) {
			this.setLatch(this.held);
			this.nextRepeatAt = now + REPEAT_PERIOD;
		}
	}
}

/** Text to //e key codes: Return for a new line (\n, \r or \r\n), ASCII kept, anything else skipped. */
export function textToKeyCodes(text: string): { codes: number[]; skipped: number } {
	const codes: number[] = [];
	let skipped = 0;
	const normalized = text.replace(/\r\n?/g, "\n");
	for (const char of normalized) {
		const code = char.codePointAt(0) as number;
		if (char === "\n") codes.push(0x0d);
		else if (code < 0x80) codes.push(code);
		else skipped++;
	}
	return { codes, skipped };
}
