import { useMachine } from "@/composables/useMachine";
import { disassemble, disassembleRange, formatDisassemblyAsText } from "./disassembler";
import { toHex, hexDump } from "./hex.utils";
import { ExpressionParser, monitorTokenizer, TokenType, type ParsedResult } from "./expressionParser/expressionParser";
import type { CommandOutput } from "@/types/command";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

export type MiniMonitorCommandRequest = {
	type: string;
	address?: number;
	returnAddress?: number;
};
type MiniMonitorReturnValue = CommandOutput | MiniMonitorCommandRequest;

const formatAddr = (addr: number) => {
	const bank = ((addr >> 16) & 0xff).toString(16).toUpperCase().padStart(2, "0");
	const offset = (addr & 0xffff).toString(16).toUpperCase().padStart(4, "0");
	return `$${bank}/${offset}`;
};

const resolveAddress = (res: ParsedResult): number | undefined => {
	if (typeof res.value === "number") return res.value;
};

let lastAddress = 0;

export async function minimonitor(input: string, vm: VirtualMachine): Promise<MiniMonitorReturnValue> {
	const parser = new ExpressionParser(input, vm, monitorTokenizer);
	const lhs = parser.parse();

	// If the expression evaluates to a string (e.g. hex(pc)), return it directly.
	if (lhs.type === TokenType.STRING && typeof lhs.value === "string") {
		return { content: lhs.value, format: "markdown" };
	}

	let startAddr = resolveAddress(lhs);
	let endAddr: number | undefined;

	if (startAddr !== undefined && parser.match(TokenType.DOT)) {
		// Range Mode: <start>.<end>
		const rhs = parser.parse();
		endAddr = resolveAddress(rhs);
		if (endAddr !== undefined && startAddr > endAddr)
			throw new Error("Start address must be less than or equal to end address.");
	}

	startAddr = startAddr ?? lastAddress;
	lastAddress = (endAddr ?? startAddr) + 1;

	// Handle explicit commands
	if (parser.match(TokenType.COLON)) {
		// Write Mode: <addr>: <val> <val> ...
		let currentAddr = startAddr;
		while (!parser.eof()) {
			const token = parser.parse();
			if (token.type === TokenType.STRING) {
				const str = String(token.value);
				const isHighAscii = token.raw.startsWith('"');
				for (let i = 0; i < str.length; i++)
					vm.writeDebug(currentAddr++, str.charCodeAt(i) | (isHighAscii ? 0x80 : 0));
			} else {
				// Number or Hex Identifier
				let val: number;
				if (typeof token.value === "number") val = token.value;
				else if (token.type === TokenType.IDENTIFIER && /^[0-9A-F]+$/i.test(token.raw))
					val = parseInt(token.raw, 16);
				else throw new Error(`Invalid value: ${token.raw}`);

				// Determine width: > 255 -> 2 bytes, else 1 byte (Little Endian)
				if (val > 0xff) {
					vm.writeDebug(currentAddr++, val & 0xff);
					vm.writeDebug(currentAddr++, (val >> 8) & 0xff);
				} else {
					vm.writeDebug(currentAddr++, val & 0xff);
				}
			}
		}
		const bytes = vm.readDebugRange(startAddr, currentAddr - startAddr);
		const output = hexDump(startAddr, bytes, { formatAddr });
		return { content: output, format: "markdown" };
	}

	let tok = parser.eof() ? { type: lhs.type, text: lhs.raw } : parser.peek();
	let cmd: string | undefined;
	if (tok.type === TokenType.IDENTIFIER) cmd = tok.text.toUpperCase();
	switch (cmd) {
		case "G":
			return { type: "JSR", address: startAddr };
		case "L": {
			const res = await runDisassembly(startAddr, endAddr, vm);
			lastAddress = res.endAddr ?? lastAddress;
			return { content: res.content, format: "markdown" };
		}
		default:
			return runHexDump(startAddr, endAddr, vm);
	}
}

async function runDisassembly(start: number, end: number | undefined, vm: VirtualMachine) {
	const { registers } = useMachine();
	const readByte = (address: number, debug = true) => (debug ? vm.readDebug(address) : vm.read(address)) ?? 0;

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

export function runHexDump(start: number, end: number | undefined, vm: VirtualMachine): CommandOutput {
	let output = "";
	if (end === undefined) {
		const byte = vm.read(start);
		output = `${formatAddr(start)}: ${toHex(byte, 2)}`;
	} else {
		const bytes = vm.readDebugRange(start, end - start + 1);
		output = hexDump(start, bytes, { formatAddr });
	}
	return { content: output, format: "markdown" };
}
