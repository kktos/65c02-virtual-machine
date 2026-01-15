export interface DebugOption {
	id: string;
	label: string;
	type: "boolean" | "select" | "number";
	category?: string;
	options?: { label: string; value: string | number }[];
	min?: number;
	max?: number;
	defaultValue?: string | number;
	savable?: boolean;
}

export interface MemoryChunk {
	bank?: number; // Optional for single-bank machines
	addr: number;
	data: Uint8Array | string;
	tag?: string;
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
	bus: {
		class: string; // exported class name
		path: string; // Path relative to the worker for dynamic import
		payload?: unknown;
	};
	video?: VideoConfig;
	disk?: DiskConfig;
	css?: string[];
	debugOptions?: DebugOption[];
	symbols?: Record<number, string>;
}
