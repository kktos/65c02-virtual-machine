import type { EmulatorRegisters } from "@/types/emulatorstate.interface";
import { readRegisters, writeRegister } from "@/virtualmachine/cpu/shared-memory";

/** The VM's register API for a test fake, over `registers`: the view the worker would write (as the VM's own). */
export const fakeRegisters = (registers = new DataView(new ArrayBuffer(64))) => ({
	registers,
	getRegisters: () => readRegisters(registers),
	updateRegister: (reg: keyof EmulatorRegisters, value: number) => writeRegister(registers, reg, value),
});
