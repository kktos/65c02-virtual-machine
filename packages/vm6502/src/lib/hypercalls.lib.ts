import type { DisassemblyLine } from "@/types/disassemblyline.interface";

export function toHex(v: number | undefined, pad: number) {
	return (v ?? 0).toString(16).toUpperCase().padStart(pad, "0");
}

export function getHypercallArgs(readByte: (address: number) => number, stringAddr: number): number {
	let args = 0;
	let ptr = stringAddr;
	let limit = 256;
	while (limit-- > 0) {
		const char = readByte(ptr);
		ptr++;
		if (char === 0) break;
		if (char === 0x25) {
			// '%'
			const fmt = readByte(ptr);
			ptr++;
			if (fmt === 0x68) args++; // 'h'
		}
	}
	return args;
}

export function runHypercall(readByte: (address: number) => number, pc: number) {
	const cmd = readByte(pc + 1);
	let hypercallLine: DisassemblyLine | null = null;
	let bytesConsumed = 0;
	const address = pc;
	switch (cmd) {
		case 0x01: {
			// LOG_STRING
			const strAddr = readByte(pc + 2) | (readByte(pc + 3) << 8);
			const args = getHypercallArgs(readByte, strAddr);
			bytesConsumed = 4 + args;
			hypercallLine = {
				address,
				opcode: "!!LOG_STRING",
				rawBytes: "",
				comment: `String @ $${toHex(strAddr, 4)}`,
				cycles: 7,
			};
			break;
		}
		case 0x02: {
			// LOG_REGS
			bytesConsumed = 2;
			hypercallLine = {
				address,
				opcode: "!!LOG_REGS",
				rawBytes: "",
				comment: "",
				cycles: 7,
			};
			break;
		}
		case 0x03: {
			// ADD_REGION
			bytesConsumed = 10;
			const start = readByte(pc + 2) | (readByte(pc + 3) << 8);
			const size = readByte(pc + 4) | (readByte(pc + 5) << 8);
			hypercallLine = {
				address,
				opcode: "!!ADD_REGION",
				rawBytes: "",
				comment: `Start: $${toHex(start, 4)}, Size: $${toHex(size, 4)}`,
				cycles: 7,
			};
			break;
		}
		case 0x04: {
			// REMOVE_REGIONS
			const count = readByte(pc + 2);
			bytesConsumed = 3 + count * 2;
			const names: string[] = [];
			for (let i = 0; i < count; i++) {
				const ptrAddr = pc + 3 + i * 2;
				const namePtr = readByte(ptrAddr) | (readByte(ptrAddr + 1) << 8);
				names.push(readString(readByte, namePtr));
			}
			hypercallLine = {
				address,
				opcode: "!!REMOVE_REGIONS",
				rawBytes: "",
				comment: `Count: ${count} (${names.join(", ")})`,
				cycles: 7,
			};
			break;
		}
	}

	if (hypercallLine) {
		const raw = [];
		const displayBytes = Math.min(bytesConsumed, 8);
		for (let i = 0; i < displayBytes; i++) raw.push(readByte(pc + i));
		hypercallLine.rawBytes = raw.map((b) => toHex(b, 2)).join(" ") + (bytesConsumed > 8 ? " ..." : "");
		pc += bytesConsumed;
		return { line: hypercallLine, pc };
	}

	return { line: undefined, pc };
}

function readString(readByte: (address: number) => number, address: number): string {
	let str = "";
	let ptr = address;
	let limit = 256;
	while (limit-- > 0) {
		const char = readByte(ptr);
		if (char === 0) break;
		str += String.fromCharCode(char & 0x7f);
		ptr++;
	}
	return str;
}
