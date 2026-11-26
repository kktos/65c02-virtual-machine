import { defineCommand, isParamListItemIdentifier } from "@/composables/useCommands";
import { toHex } from "@/lib/hex.utils";
import type { CommandContext } from "@/types/command";
import type { EmulatorRegisters } from "@/types/emulatorstate.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

const BYTE_REGISTERS = ["A", "X", "Y", "P", "SP"];

/**
 * The registers can only be written paused (see `updateRegister`): a running machine is paused first, resumed after,
 * as the Monitor's G does.
 */
async function writeRegisterPaused(vm: VirtualMachine, reg: keyof EmulatorRegisters, value: number) {
	const wasRunning = vm.isRunningOrStarting;
	if (wasRunning) await vm.pauseAndWait();
	vm.updateRegister(reg, value);
	if (wasRunning) vm.play();
}

export const setCmd = defineCommand({
	description: "Set register `name` value to `byte` or `word`",
	paramDef: ["name", "byte|word"],
	group: "Monitor",
	fn: async ({ vm, params }: CommandContext) => {
		const val = params[1] as number;

		// `set pc $300` hands over the parsed name ({ text, value });
		// `pc = $300` the text, and `$300 = 12` the address as a decimal string.
		const dest = isParamListItemIdentifier(params[0]) ? params[0].text : String(params[0]);

		if (/^[0-9]+$/.test(dest)) {
			const addr = parseInt(dest);
			vm.writeDebug(addr, val);
			return `$${toHex(addr)} = $${toHex(val)}`;
		}

		const reg = dest.toUpperCase();

		if (BYTE_REGISTERS.includes(reg)) {
			if (val > 0xff || val < 0) throw new Error(`Value out of range [0-255]`);
			await writeRegisterPaused(vm, reg as keyof EmulatorRegisters, val);
			return `Register ${reg} set to $${toHex(val)}`;
		}

		if (reg === "PC") {
			if (val > 0xffff || val < 0) throw new Error(`Value out of range [0-65535]`);
			await writeRegisterPaused(vm, reg, val);
			return `Register ${reg} set to $${toHex(val, 4)}`;
		}

		throw new Error(`Invalid register: ${reg}`);
	},
});
