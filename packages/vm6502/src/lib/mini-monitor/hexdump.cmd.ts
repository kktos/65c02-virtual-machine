import type { CommandOutput } from "@/types/command";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { toHex, hexDump, formatAddress } from "../hex.utils";

export function runHexDump(start: number, end: number | undefined, vm: VirtualMachine): CommandOutput {
	let output = "";
	if (end === undefined) {
		const byte = vm.read(start);
		output = `${formatAddress(start, "/")}: ${toHex(byte, 2)}`;
	} else {
		const bytes = vm.readDebugRange(start, end - start + 1);
		output = hexDump(start, bytes, { formatAddr: (addr) => formatAddress(addr, "/") });
	}
	return { content: output, format: "markdown" };
}
