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
}

export interface VideoConfig {
	size: number;
	width: number;
	height: number;
	class: string; // exported class name
	path: string; // Path relative to the worker for dynamic import
}

export interface MachineConfig {
	name: string;
	speed?: number;
	memory: MemoryConfig;
	bus: {
		class: string; // exported class name
		path: string; // Path relative to the worker for dynamic import}
	};
	video?: VideoConfig;
}
