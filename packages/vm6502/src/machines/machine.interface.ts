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
	payload?: any;
}

export interface MachineConfig {
	name: string;
	speed?: number;
	memory: MemoryConfig;
	bus: {
		class: string; // exported class name
		path: string; // Path relative to the worker for dynamic import
		payload?: any;
	};
	video?: VideoConfig;
	css?: string[];
}
