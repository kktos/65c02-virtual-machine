import type { DebugOption } from "@/virtualmachine/cpu/bus.interface";

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
}
