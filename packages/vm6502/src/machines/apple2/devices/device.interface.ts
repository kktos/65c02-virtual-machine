import type { Dict } from "@/types/dict.type";
import type { AppleBus } from "../apple.bus";

/** How the //e wires a device (`DeviceConfig.options`, apple.bus.ts `installDevices`). */
export interface AppleDeviceWiring {
	/** Its registers, in the I/O space: `size` addresses from `address`, read / written at offsets 0 to size-1. */
	io?: { address: number; size: number };
	/** The IMU ID its line drives (the slots take 1-7, see IMU.md). None: it never interrupts. */
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
	tick?(cycles: number): void;
	/** On any reset, after the IMU's. */
	reset?(): void;
	/** Its state in a save state (a structured-clonable value). */
	snapshot?(): unknown;
	restoreSnapshot?(state: unknown): void;
}

export type AppleDeviceClass = new (context: AppleDeviceContext) => AppleDevice;
