import type { KeyboardState } from "@/types/bus.interface";

/** Cycles after a strobe clear before the next typed key is given to the program: about 10 ms at 1 MHz. */
export const DEFAULT_KEY_DELAY = 10_000;
/** A held key repeats after about half a second, then 15 times a second (the //e's auto-repeat). */
const REPEAT_DELAY = 512_000;
const REPEAT_PERIOD = 68_000;

/** What a save state keeps of the keyboard, besides the latch and strobe (bus fields). Not the real keys down. */
export type KeyboardSnapshot = {
	queue: number[];
	held: number;
	typedDown: boolean;
	strobeClearedAt: number;
	nextRepeatAt: number;
};

/**
 * The //e keyboard: the latch ($C000: the last key, bit 7 the strobe), the strobe clear ($C010, which reads AKD,
 * "a key is down", in bit 7), the keys down, and the keys typed by software (paste, `type_keys`, the `key` command).
 *
 * The typed keys wait in a queue, paced by the program: the next one is latched when the program reads $C000 with
 * the strobe clear, `keyDelay` cycles or more after it consumed the previous one (cleared the strobe). A program
 * that flushes the keyboard (STA $C010) some time after reading a key eats the next one if it was already there:
 * a longer delay avoids it, a shorter one types faster. 0 gives the next key as soon as the program asks.
 */
export class AppleKeyboard {
	public latch = 0;
	public strobe = false;
	public keyDelay = DEFAULT_KEY_DELAY;

	private queue: number[] = [];
	/** The key held by `hold` (-1: none): down, and repeating. */
	private held = -1;
	/** A typed key is down from when it's latched until the program clears the strobe. */
	private typedDown = false;
	/** The real keys down (KeyboardEvent.code), for AKD. */
	private keysDown = new Set<string>();
	private strobeClearedAt = 0;
	private nextRepeatAt = 0;

	constructor(private readonly now: () => number) {}

	get anyKeyDown() {
		return this.typedDown || this.held >= 0 || this.keysDown.size > 0;
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

	clear() {
		this.queue.length = 0;
	}

	/** The cycle counter restarts at 0: the times kept would hold the keys back. The keys stay (a reset doesn't lift them). */
	reset() {
		this.strobeClearedAt = 0;
		this.nextRepeatAt = 0;
	}

	state(): KeyboardState {
		return {
			queued: this.queue.length,
			held: this.held < 0 ? null : this.held,
			delay: this.keyDelay,
			latch: this.latch,
			strobe: this.strobe,
			keyDown: this.anyKeyDown,
		};
	}

	snapshot(): KeyboardSnapshot {
		return {
			queue: [...this.queue],
			held: this.held,
			typedDown: this.typedDown,
			strobeClearedAt: this.strobeClearedAt,
			nextRepeatAt: this.nextRepeatAt,
		};
	}

	restoreSnapshot(state: KeyboardSnapshot | undefined) {
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
