import { useMachine } from "@/composables/useMachine";
import { disassemble, disassembleRange, formatDisassemblyAsText } from "./disassembler";
import { toHex, hexDump } from "./hex.utils";
import { parseHexValue } from "./parse.utils";
import type { Dict } from "@/types/dict.type";

type StrippedVM = {
	readDebug(address: number, overrides?: Dict | undefined): number | undefined;
	readDebugRange(address: number, length: number, overrides?: Dict): Uint8Array;
	read(address: number): number;
	writeDebug(address: number, value: number): void;
	getScope(address: number): string;
};

type ReturnValue =
	| {
			content: string;
			format: "markdown" | "text";
	  }
	| {
			type: string;
			address?: number;
			returnAddress?: number;
	  };

const formatAddr = (addr: number) => {
	const bank = ((addr >> 16) & 0xff).toString(16).toUpperCase().padStart(2, "0");
	const offset = (addr & 0xffff).toString(16).toUpperCase().padStart(4, "0");
	return `$${bank}/${offset}`;
};

export function minimonitor(input: string, vm: StrippedVM): ReturnValue {
	let output = "";
	let commandRequest: ReturnValue | undefined;

	const trimmed = input.trim();

	// Write command: <addr>: <values>
	const colonIdx = trimmed.indexOf(":");
	if (colonIdx !== -1) {
		const addrPart = trimmed.substring(0, colonIdx).trim();
		const dataPart = trimmed.substring(colonIdx + 1).trim();

		const cleanAddr = addrPart.startsWith("$") ? addrPart.slice(1) : addrPart;
		const address = parseHexValue(cleanAddr, 0xffffff);

		const tokens = dataPart.match(/"[^"]*"|'[^']*'|\S+/g) || [];
		let currentAddr = address;

		for (const token of tokens) {
			if (token.startsWith('"') && token.endsWith('"')) {
				const str = token.slice(1, -1);
				for (let i = 0; i < str.length; i++) vm.writeDebug(currentAddr++, str.charCodeAt(i) | 0x80);
			} else if (token.startsWith("'") && token.endsWith("'")) {
				const str = token.slice(1, -1);
				for (let i = 0; i < str.length; i++) vm.writeDebug(currentAddr++, str.charCodeAt(i));
			} else {
				let val = parseInt(token, 16);
				if (Number.isNaN(val)) throw new Error(`Invalid value: ${token}`);
				let byteWidth = 1;
				byteWidth = Math.ceil(token.length / 2);
				if (byteWidth === 0) byteWidth = 1;
				for (let i = 0; i < byteWidth; i++) vm.writeDebug(currentAddr++, (val >> (i * 8)) & 0xff);
			}
		}
		const bytes = vm.readDebugRange(address, currentAddr - address);
		output = hexDump(address, bytes, { formatAddr });
		return { content: output, format: "markdown" };
	}

	// G command: JSR to address
	if (trimmed.toUpperCase().endsWith("G")) {
		let jsrAddressStr = trimmed.substring(0, trimmed.length - 1).trim();
		let jsrAddress: number | undefined;

		if (jsrAddressStr !== "") {
			const cleanAddr = jsrAddressStr.startsWith("$") ? jsrAddressStr.slice(1) : jsrAddressStr;
			jsrAddress = parseHexValue(cleanAddr, 0xffffff);
		}

		commandRequest = {
			type: "JSR",
			address: jsrAddress,
		};

		return commandRequest;
	}

	const upperInput = trimmed.toUpperCase();
	const isDisassembly = upperInput.endsWith("L");
	const cleanInput = isDisassembly ? trimmed.slice(0, -1).trim() : trimmed;

	const parts = cleanInput.split(".") as [string, string];
	if (parts.length > 2 || parts.some((p) => !p.trim() || !/^[0-9a-fA-F]+$/.test(p.trim())))
		throw new Error("Invalid monitor command format");

	const addr1 = parseHexValue(parts[0].trim(), 0xffffff);
	const addr2 = parts.length > 1 ? parseHexValue(parts[1].trim(), 0xffffff) : undefined;

	if (isDisassembly) {
		const startAddr = addr1;
		const { registers } = useMachine();
		const readByte = (address: number, debug = true) => (debug ? vm.readDebug(address) : vm.read(address)) ?? 0;

		if (addr2 !== undefined) {
			if (startAddr > addr2) throw new Error("Start address must be less than end address.");
			const lines = disassembleRange(readByte, vm.getScope(startAddr), startAddr, addr2, registers);
			output = formatDisassemblyAsText(lines, {
				withOrg: false,
				withAddr: true,
				withBytes: true,
				asMarkdown: true,
			});
		} else {
			const lines = disassemble(readByte, vm.getScope(startAddr), startAddr, 32, registers);
			output = formatDisassemblyAsText(lines, {
				withOrg: false,
				withAddr: true,
				withBytes: true,
				asMarkdown: true,
			});
		}
		return { content: output, format: "markdown" };
	}

	const startAddr = addr1;
	const endAddr = addr2 ?? startAddr;
	if (startAddr > endAddr) throw new Error("Start address must be less than or equal to end address.");
	if (addr2 === undefined) {
		const byte = vm.read(startAddr);
		output = `${formatAddr(startAddr)}: ${toHex(byte, 2)}`;
	} else {
		const bytes = vm.readDebugRange(startAddr, endAddr - startAddr);
		output = hexDump(startAddr, bytes, { formatAddr });
	}

	return { content: output, format: "markdown" };
}
