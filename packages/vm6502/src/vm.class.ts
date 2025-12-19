import {
	FLAG_B_MASK,
	FLAG_C_MASK,
	FLAG_D_MASK,
	FLAG_I_MASK,
	FLAG_N_MASK,
	FLAG_V_MASK,
	FLAG_Z_MASK,
	MEMORY_OFFSET,
	REG_A_OFFSET,
	REG_PC_OFFSET,
	REG_SP_OFFSET,
	REG_STATUS_OFFSET,
	REG_X_OFFSET,
	REG_Y_OFFSET,
} from "@/cpu/shared-memory";
import type { MachineConfig } from "@/types/machine.interface";
import type { Breakpoint } from "./types/breakpoint.interface";
import type { EmulatorState } from "./types/emulatorstate.interface";

const parseHexData = (data: string): Uint8Array => {
	const bytes = data
		.trim()
		.split(/\s+/)
		.map((s) => parseInt(s, 16));
	return new Uint8Array(bytes);
};

export class VirtualMachine {
	public sharedBuffer: SharedArrayBuffer;
	public sharedRegisters: DataView;
	public sharedMemory: Uint8Array;

	public worker: Worker;
	public machineConfig: MachineConfig;

	constructor(machineConfig: MachineConfig) {
		this.machineConfig = machineConfig;
		this.worker = new Worker(new URL("./cpu/cpu.worker.ts", import.meta.url), { type: "module" });

		// 1. Initialize memory on the main thread
		const bufferSize = MEMORY_OFFSET + this.machineConfig.memory.size;
		this.sharedBuffer = new SharedArrayBuffer(bufferSize);
		this.sharedRegisters = new DataView(this.sharedBuffer, 0, MEMORY_OFFSET);
		this.sharedMemory = new Uint8Array(this.sharedBuffer, MEMORY_OFFSET, this.machineConfig.memory.size);

		// 2. Load data into memory from the main thread
		this.loadMemoryChunks();

		// 3. Initialize the worker with the prepared buffer and necessary config
		this.worker.postMessage({
			command: "init",
			buffer: this.sharedBuffer,
			machine: {
				name: this.machineConfig.name,
				memory: { size: this.machineConfig.memory.size },
				busPath: this.machineConfig.busPath,
			},
		});
	}

	private loadMemoryChunks() {
		this.sharedMemory.fill(0); // Clear memory first
		if (this.machineConfig.memory.chunks) {
			for (const chunk of this.machineConfig.memory.chunks) {
				let data: Uint8Array;
				if (typeof chunk.data === "string") data = parseHexData(chunk.data);
				else data = chunk.data;

				console.log(`VM: Loading ${data.length} bytes at $${chunk.addr.toString(16)}`);
				this.sharedMemory.set(data, chunk.addr);
			}
		}
	}

	public play = () => this.worker.postMessage({ command: "run" });
	public pause = () => this.worker.postMessage({ command: "pause" });
	public step = () => this.worker.postMessage({ command: "step" });
	public reset = () => this.worker.postMessage({ command: "reset" });

	public addBP(type: Breakpoint["type"], address: number) {
		this.worker.postMessage({ command: "addBP", type, address });
	}
	public removeBP(type: Breakpoint["type"], address: number) {
		this.worker.postMessage({ command: "removeBP", type, address });
	}
	public clearBPs() {
		this.worker.postMessage({ command: "clearBPs" });
	}

	public updateMemory(addr: number, value: number) {
		this.sharedMemory[addr] = value;
	}

	public updateRegister(reg: keyof EmulatorState["registers"], value: number) {
		switch (reg) {
			case "A":
				this.sharedRegisters.setUint8(REG_A_OFFSET, value);
				break;
			case "X":
				this.sharedRegisters.setUint8(REG_X_OFFSET, value);
				break;
			case "Y":
				this.sharedRegisters.setUint8(REG_Y_OFFSET, value);
				break;
			case "SP":
				this.sharedRegisters.setUint8(REG_SP_OFFSET, value);
				break;
			case "PC":
				this.sharedRegisters.setUint16(REG_PC_OFFSET, value, true);
				break;
			case "P": {
				// This handles setting the entire status register from a single byte value.
				// The B flag (bit 4) and the unused flag (bit 5) are typically not modified this way.
				// We'll preserve them from the current status.
				const currentStatus = this.sharedRegisters.getUint8(REG_STATUS_OFFSET);
				const newStatus = (value & ~0x30) | (currentStatus & 0x30);
				this.sharedRegisters.setUint8(REG_STATUS_OFFSET, newStatus);
				break;
			}
			case "N":
			case "V":
			case "B": // Note: B is often read-only, but we allow toggling for debugging.
			case "D":
			case "I":
			case "Z":
			case "C": {
				const flagMasks = {
					N: FLAG_N_MASK,
					V: FLAG_V_MASK,
					B: FLAG_B_MASK,
					D: FLAG_D_MASK,
					I: FLAG_I_MASK,
					Z: FLAG_Z_MASK,
					C: FLAG_C_MASK,
				};
				const mask = flagMasks[reg];
				let status = this.sharedRegisters.getUint8(REG_STATUS_OFFSET);
				if (value) status |= mask;
				else status &= ~mask;
				this.sharedRegisters.setUint8(REG_STATUS_OFFSET, status);
				break;
			}
		}
	}

	public terminate() {
		this.worker.terminate();
		console.log("VM: Worker terminated.");
	}
}
