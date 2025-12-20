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

export interface MachineConfig {
	name: string;
	speed?: number;
	memory: MemoryConfig;
	busPath: string; // Path relative to the worker for dynamic import
}
