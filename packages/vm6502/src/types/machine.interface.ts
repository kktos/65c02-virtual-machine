import type { DataBlock } from "@/composables/useDataFormattings";
import type { SymbolDict } from "@/composables/useSymbols";

export interface DebugOption {
	id: string;
	label: string;
	/** "label" is a sub-heading inside a group: only its label is shown, it holds no value */
	type: "boolean" | "select" | "number" | "color" | "label";
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
	/** The image files the drive takes (".d64"): the library lists those, a file must be one of them */
	extensions: string[];
	/** Bytes per block in the activity log's map (512: ProDOS blocks, 256: CBM sectors). Default 512. */
	blockSize?: number;
	/**
	 * For a ROM that doesn't boot from the disk itself: the keys typed after a cold boot to start the disk
	 * (the PET: `LOAD"*",8` and `RUN`). Without it, the cold boot boots the disk.
	 */
	bootKeys?: string;
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
	};
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
