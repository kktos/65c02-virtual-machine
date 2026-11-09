import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { disassembleRange, disassemble, formatDisassemblyAsText } from "../disassembler";

export async function runDisassembly(start: number, end: number | undefined, vm: VirtualMachine) {
	const readByte = (address: number, debug = true) => (debug ? vm.readDebug(address) : vm.peek(address)) ?? 0;
	vm.syncBusState(); // `peek` follows the banking soft switches: have them current
	const registers = vm.getRegisters();

	let lines = [];
	if (end !== undefined) {
		lines = await disassembleRange({
			readByte,
			scope: vm.getScope(start),
			fromAddress: start,
			toAddress: end,
			registers,
		});
	} else {
		lines = await disassemble({
			readByte,
			scope: vm.getScope(start),
			fromAddress: start,
			lineCount: 32,
			registers,
		});
	}

	const output = formatDisassemblyAsText(lines, {
		withOrg: false,
		withAddr: true,
		withBytes: true,
		asMarkdown: true,
	});
	const lastLine = lines.at(-1)!;
	return { content: output, endAddr: lastLine.addr + lastLine.bytes.split(" ").length };
}
