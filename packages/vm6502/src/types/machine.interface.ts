import type { DataBlock } from "@/composables/useFormatting";
import type { SymbolDict } from "@/composables/useSymbols";

export interface DebugOption {
	id: string;
	label: string;
	type: "boolean" | "select" | "number" | "color";
	options?: { label: string; value: string | number; color?: string }[];
	min?: number;
	max?: number;
	defaultValue?: string | number;
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
	data: Uint8Array | string;
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
	name?: string;
	boot?: boolean;
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
		dataBlocks?: Record<number, DataBlock>;
	};
}
