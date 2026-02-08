export type SymbolDict = Record<number, Record<string, { label: string; source: string; scope: string }>>;

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
}

export interface DiskConfig {
	enabled: boolean;
	name?: string;
	boot?: boolean;
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
	debugOptions?: DebugGroup[];
	symbols?: SymbolDict;
}
