import { formatAddress, hexDump } from "../hex.utils";
import { ExpressionParser, TokenType, type ParsedResult } from "../expressionParser/expressionParser";
import type { CommandOutput } from "@/types/command";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { runDisassembly } from "./disassembly.cmd";
import { runHexDump } from "./hexdump.cmd";
import { monitorTokenizer } from "./tokenizer";

export type MiniMonitorCommandRequest = {
	type: string;
	address?: number;
	returnAddress?: number;
};
type MiniMonitorReturnValue = CommandOutput | MiniMonitorCommandRequest;

const resolveAddress = (res: ParsedResult): number | undefined => {
	if (typeof res.value === "number") return res.value;
};

let lastAddress = 0;
/*
- memview
  300
  300.3ff
- memset
  300: 00 00 ...
- disassembly List
  300L
  300.310L
- run
  G
  fc58G
 */
export async function minimonitor(input: string, vm: VirtualMachine): Promise<MiniMonitorReturnValue> {
	const parser = new ExpressionParser(input, vm, monitorTokenizer);
	const lhs = parser.parse();

	// If the expression evaluates to a string (e.g. hex(pc)), return it directly.
	if (lhs.type === TokenType.STRING && typeof lhs.value === "string")
		return { content: lhs.value, format: "markdown" };

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
		const output = hexDump(startAddr, bytes, { formatAddr: (addr) => formatAddress(addr, "/") });
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
