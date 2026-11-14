// Disassembly of bytes read from a disk (a file, a sector), not from memory: the debugger's disassembler, without
// what belongs to the memory at those addresses (data formats, comments, hypercalls); labels optional.

import { disassembleRange } from "@/lib/disassembler";
import { toHex } from "@/lib/hex.utils";
import { BRANCH_OPCODES } from "@/lib/opcodes";
import type { DisassemblyLine } from "@/types/disassemblyline.interface";

export type DiskDisasmLine = DisassemblyLine & {
	/** A jump / branch / call to an address of these bytes: where it lands */
	target?: number;
};

/** Data bytes: a .DB line */
const dataLine = (bytes: Uint8Array, addr: number, label = ""): DiskDisasmLine => {
	const values = Array.from(bytes);
	return {
		label,
		src: "",
		addr,
		faddr: "",
		mode: "IMP",
		opc: ".DB",
		opr: values.map((b) => `$${toHex(b)}`).join(","),
		oprn: 0,
		bytes: values.map((b) => toHex(b)).join(" "),
		size: values.length,
		info: "",
		comment: "",
		blockComment: "",
		cycles: 0,
	};
};

/**
 * The 65C02 code in `bytes`, loaded at `origin`; `start`: where the code starts (the bytes before are data: a boot
 * sector's count at $0800). An instruction cut by the end shows as data bytes.
 */
export async function disassembleBytes(
	bytes: Uint8Array,
	origin: number,
	{ labels = true, start = origin }: { labels?: boolean; start?: number } = {},
): Promise<DiskDisasmLine[]> {
	if (!bytes.length) return [];
	const end = origin + bytes.length;
	const from = Math.min(Math.max(start, origin), end);
	const lines: DiskDisasmLine[] = from > origin ? [dataLine(bytes.subarray(0, from - origin), origin)] : [];
	if (from < end)
		lines.push(
			...(await disassembleRange({
				readByte: (address) => bytes[address - origin] ?? 0,
				scope: "main",
				fromAddress: from,
				toAddress: end - 1,
				detached: true,
				labels,
			})),
		);

	const last = lines.at(-1);
	if (last && last.addr + last.size > end)
		lines[lines.length - 1] = dataLine(bytes.subarray(last.addr - origin), last.addr, last.label);

	const starts = new Set(lines.map((l) => l.addr));
	for (const line of lines)
		if (
			BRANCH_OPCODES.has(line.opc.toUpperCase()) &&
			line.mode !== "IND" &&
			line.mode !== "IAX" &&
			starts.has(line.oprn)
		)
			line.target = line.oprn;
	return lines;
}
