import type { DataBlock } from "@/composables/useDataFormattings";
import type { SymbolDict } from "@/composables/useSymbols";
import type { Dict } from "@/types/dict.type";

export interface DebugOption {
	id: string;
	label: string;
	/**
	 * "label" is a sub-heading inside a group: only its label is shown, it holds no value.
	 * "slider" is a number picked between `min` and `max`, its value shown beside it.
	 */
	type: "boolean" | "select" | "number" | "slider" | "color" | "label";
	options?: { label: string; value: string | number; color?: string }[];
	min?: number;
	max?: number;
	defaultValue?: string | number | boolean;
	savable?: boolean;
	disableIf?: { optionId: string; value: string | number | boolean };
}

export interface DebugGroup {
	label: string;
	category: string;
	rows: DebugOption[][];
}

export interface MemoryChunk {
	bank?: number; // Optional for single-bank machines
	addr: number;
	/** The bytes, or hex text ("A9 00 …"). */
	data?: Uint8Array | string;
	/**
	 * Instead of `data`: a file the main thread fetches, relative to the app (e.g. "roms/pet/kernal.bin" for
	 * public/roms/pet/kernal.bin). For ROMs that aren't in the repo. Must be `size` bytes when given.
	 */
	src?: string;
	size?: number;
	tag?: string;
}

export interface MemoryRegion {
	name: string;
	start: number;
	size: number;
	color?: string;
	removable?: boolean;
	bank?: number;
}

export interface MemoryConfig {
	size: number;
	banks?: number;
	chunks?: MemoryChunk[];
	buffer?: SharedArrayBuffer;
}

export interface VideoConfig {
	width: number;
	height: number;
	class: string; // exported class name
	path: string; // Path relative to the worker for dynamic import
	buffer?: SharedArrayBuffer;
	payload?: unknown;
	hasTests?: boolean;
}

export interface DiskConfig {
	enabled: boolean;
	/** The drive, as the UI names it */
	name?: string;
	/** Bytes per block in the activity log's map (512: ProDOS blocks, 256: CBM sectors). Default 512. */
	blockSize?: number;
	/**
	 * For a ROM that doesn't boot from the disk itself: the keys typed after a cold boot to start the disk
	 * (the PET: `LOAD"*",8` and `RUN`). Without it, the cold boot boots the disk.
	 */
	bootKeys?: string;
	/**
	 * The formats the machine's disks are in (ids of `lib/disk/formats`: "apple2", "cbm"). Their extensions are
	 * the image files the drive takes (the library lists those, a file must be one of them); the disk editor
	 * tries them in order. None: the drive takes no image.
	 */
	formats?: string[];
	/**
	 * The disk editor: the viewers of a file / sector's bytes, in the order of their buttons (ids of
	 * `app/diskeditor/viewers/index.ts`: "hex", "hgr", "disasm"). The hex dump is always there.
	 */
	viewers?: string[];
}

export interface MachineInputControl {
	id: string;
	label: string;
	type: "button" | "axis";
	index?: number;
}

export type InputDeviceType = "joystick" | "paddle" | "gamepad" | "mouse";

export interface MachineInputDevice {
	type: InputDeviceType;
	label: string;
	controls: MachineInputControl[];
}

/** A card type a machine's slots take (its bus knows how to build it from `id`). */
export interface SlotCardType {
	id: string;
	label: string;
	/** The slots it can go in (default: all of them). */
	slots?: number[];
}

/** Which card in which slot: slot number → card id. A slot not in it is empty. */
export type SlotLayout = Record<number, string>;

/** A machine's expansion slots, numbered 1 to `count`. */
export interface SlotsConfig {
	count: number;
	cards: SlotCardType[];
	/** Slots the machine itself answers for (slot → what is there, e.g. the //e's 80-column firmware): shown, never offered. */
	builtin?: Record<number, string>;
	/** The layout when the user has set none. */
	default: SlotLayout;
}

/** The machine's setup as the user chose it, given to its bus constructor. */
export interface BusOptions {
	/** The cards in the slots (see `MachineConfig.slots`); none given: the machine's default. */
	slots?: SlotLayout;
}

/**
 * A device the machine has besides its slot cards (the //e's timer…), its class loaded at run time like the bus and
 * the video: from `path` (relative to `src/machines`, without `.ts`; the file must be a `*.device.ts`), the export
 * named `class`. Built and wired by the bus (`IBus.installDevices`), on both threads.
 */
export interface DeviceConfig {
	/** Unique in the machine: names it in the save states. */
	id: string;
	/** As the debugger names it (default: `id`). */
	label?: string;
	class: string; // exported class name
	path: string; // Path relative to src/machines for dynamic import
	/** For the bus: how it wires the device (the //e: its I/O addresses, its IMU ID) and the device's own settings. */
	options?: Dict;
}

/** A device whose class is loaded, given to the bus to build and wire (see `DeviceConfig`). */
export interface LoadedDevice {
	config: DeviceConfig;
	/** What the bus builds it with is the machine's own contract (the //e: `AppleDeviceClass`). */
	Class: new (...args: never[]) => object;
}

export interface MachineSpeed {
	label: string;
	value: number;
}

export interface MachineConfig {
	name: string;
	speed?: number;
	/**
	 * Run `BRK <cmd>` (cmd $01-$04) as a hypercall (log, add memory region…) instead of a BRK.
	 * Off by default: real software can have those bytes after a BRK.
	 */
	hypercalls?: boolean;
	memory: MemoryConfig;
	regions?: MemoryRegion[];
	bus: {
		class: string; // exported class name
		path: string; // Path relative to the worker for dynamic import
		payload?: unknown;
		/** What the bus is built with (`new BusClass(memory, options)`), on both threads. */
		options?: BusOptions;
	};
	/** Expansion slots the user can fill (none: the machine has no slots). */
	slots?: SlotsConfig;
	/** The devices the bus installs besides the slot cards, in this order. */
	devices?: DeviceConfig[];
	video?: VideoConfig;
	disk?: DiskConfig;
	css?: string[];
	inputs?: MachineInputDevice[];
	speeds?: MachineSpeed[];
	debug?: {
		symbols?: SymbolDict;
		options?: DebugGroup[];
		dataBlocks?: Record<number, Record<string, DataBlock>>;
	};
	routines?: Record<string, string>;
}
