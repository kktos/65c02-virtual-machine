import { useMemoryMap } from "@/composables/useMemoryMap";
import { REG_A_OFFSET, REG_SP_OFFSET, REG_STATUS_OFFSET, REG_X_OFFSET, REG_Y_OFFSET } from "./cpu/shared-memory";
import type { VirtualMachine } from "./virtualmachine.class";

export const HYPERCALL_COMMANDS = new Set([0x01, 0x02, 0x03]);

export function executeHypercallCmd(vm: VirtualMachine, cmd: number, pc: number) {
	let offsetPC = 0;
	switch (cmd) {
		case 0x01: {
			// LOG_STRING
			// Read the 16-bit address of the string from PC+2 and PC+3
			const stringAddr = vm.read(pc + 2) | (vm.read(pc + 3) << 8);
			const { message, argsConsumed } = readFormattedString(vm, stringAddr, pc + 4);

			// Log the message
			vm.emitLog({ kind: "HYPER", message });

			// Advance PC past the BRK and its arguments (BRK, CMD, ADDR_LO, ADDR_HI)
			offsetPC = 4 + argsConsumed;
			break;
		}

		case 0x02: {
			// LOG_REGS
			const A = vm.sharedRegisters.getUint8(REG_A_OFFSET);
			const X = vm.sharedRegisters.getUint8(REG_X_OFFSET);
			const Y = vm.sharedRegisters.getUint8(REG_Y_OFFSET);
			const SP = vm.sharedRegisters.getUint8(REG_SP_OFFSET);
			const P = vm.sharedRegisters.getUint8(REG_STATUS_OFFSET);

			const message = `A:${A.toString(16).padStart(2, "0")} X:${X.toString(16).padStart(2, "0")} Y:${Y.toString(16).padStart(2, "0")} P:${P.toString(16).padStart(2, "0")} SP:${SP.toString(16).padStart(2, "0")}`;
			vm.emitLog({ kind: "HYPER", message });

			// Advance PC past BRK and command byte
			offsetPC = 2;

			break;
		}

		case 0x03: {
			// ADD_REGION
			// Format: BRK $03 <Start:word> <Size:word> <NamePtr:word> <Bank:word>
			const start = vm.read(pc + 2) | (vm.read(pc + 3) << 8);
			const size = vm.read(pc + 4) | (vm.read(pc + 5) << 8);
			const namePtr = vm.read(pc + 6) | (vm.read(pc + 7) << 8);
			const bank = vm.read(pc + 8) | (vm.read(pc + 9) << 8);

			const name = readString(vm, namePtr);

			const { addRegion } = useMemoryMap();
			addRegion({ name, start, size, bank, removable: true });

			// console.log(`VM: ADD_REGION: ${name} @ $${start.toString(16)} size $${size.toString(16)}`);

			offsetPC = 10;
			break;
		}
	}

	console.log(`VM: PC = $${(pc + offsetPC).toString(16)}`);

	vm.updateRegister("PC", pc + offsetPC);
	vm.play();
}

function readString(vm: VirtualMachine, address: number): string {
	let message = "";
	let charAddr = address;
	let charCode = vm.read(charAddr);
	// Safety break at 256 chars to prevent infinite loops on unterminated strings
	while (charCode !== 0 && message.length < 256) {
		message += String.fromCharCode(charCode & 0x7f);
		charAddr++;
		charCode = vm.read(charAddr);
	}
	return message;
}

function readFormattedString(
	vm: VirtualMachine,
	stringAddr: number,
	argPtr: number,
): { message: string; argsConsumed: number } {
	let message = "";
	let charAddr = stringAddr;
	let argsConsumed = 0;

	// Safety break at 256 chars to prevent infinite loops on unterminated strings
	while (message.length < 256) {
		const charCode = vm.read(charAddr++);
		if (charCode === 0) break; // End of string

		if (charCode === 0x25) {
			// '%'
			const formatCode = vm.read(charAddr++);
			switch (String.fromCharCode(formatCode & 0x7f)) {
				case "h": {
					const val = vm.read(argPtr + argsConsumed);
					argsConsumed++;
					message += val.toString(16).padStart(2, "0");
					break;
				}
				case "%":
					message += "%";
					break;
				default:
					message += `%${String.fromCharCode(formatCode & 0x7f)}`;
					break;
			}
		} else {
			message += String.fromCharCode(charCode & 0x7f);
		}
	}

	return { message, argsConsumed };
}
