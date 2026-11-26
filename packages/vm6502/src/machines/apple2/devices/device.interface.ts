import type { KeyboardState } from "@/types/bus.interface";
import type { Dict } from "@/types/dict.type";
import type { AppleBus } from "../apple.bus";

/** How the //e wires a device (`DeviceConfig.options`, apple.bus.ts `installDevices`). */
export interface AppleDeviceWiring {
	/** Its registers, in the slots' I/O space: `size` addresses from `address`, read / written at offsets 0 to size-1. */
	io?: { address: number; size: number };
	/**
	 * The //e's own soft switches it takes over ($C000-$C08F), by access: a read of one calls `readSwitch`, a write
	 * `writeSwitch`, with its address. The machine's own handler there is replaced (the keyboard's $C000 / $C010).
	 */
	switches?: { read?: number[]; write?: number[] };
	/** The IMU ID its line drives (the slots take 1-7, see docs/IMU.md). None: it never interrupts. */
	irq?: number;
}

/** What a //e device is built with. */
export interface AppleDeviceContext {
	bus: AppleBus;
	/** Drives its IMU line (a no-op when it has no `irq`). */
	setIrq(active: boolean): void;
	/** Its config's `options`: the wiring, and its own settings. */
	options: AppleDeviceWiring & Dict;
}

/** A device of the //e besides the slot cards (see `MachineConfig.devices`). All of it optional. */
export interface AppleDevice {
	/** A register at `offset` in its I/O range. */
	read?(offset: number): number;
	write?(offset: number, value: number): void;
	/** One of the soft switches it takes over (`switches`), at its address. */
	readSwitch?(address: number): number;
	writeSwitch?(address: number, value: number): void;
	/** The cycles gone by since its last tick: batched, and before any access to its registers or switches. */
	tick?(cycles: number): void;
	/** The cycles until it must be ticked (it raises an interrupt), Infinity when nothing is coming. */
	nextEvent?(): number;
	/** On any reset, after the IMU's. */
	reset?(): void;
	/** Its state in a save state (a structured-clonable value). */
	snapshot?(): unknown;
	restoreSnapshot?(state: unknown): void;
}

export type AppleDeviceClass = new (context: AppleDeviceContext) => AppleDevice;

/**
 * The device that is the //e's keyboard (at most one). Besides its soft switches, the bus gives it the host's keys
 * and the typed ones (`IBus.pressKey`, `typeText`…), puts its latch in the status reads ($C011-$C01F), and ORs its
 * Apple keys with the joystick's buttons ($C061 / $C062).
 */
export interface AppleKeyboardDevice extends AppleDevice {
	/** The last key (7 bits). */
	readonly latch: number;
	readonly openApple: boolean;
	readonly solidApple: boolean;
	pressKey(key: string, code?: string, ctrl?: boolean): void;
	releaseKey(key?: string, code?: string): void;
	typeText(text: string): { queued: number; skipped: number };
	holdKey(key: string | number | null): void;
	clearKeys(): void;
	setKeyDelay(cycles: number): void;
	getKeyboardState(): KeyboardState;
}

export const isKeyboardDevice = (device: AppleDevice): device is AppleKeyboardDevice =>
	typeof (device as Partial<AppleKeyboardDevice>).getKeyboardState === "function";
