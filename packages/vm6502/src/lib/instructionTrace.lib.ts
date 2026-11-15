import { disassemble } from "@/lib/disassembler";
import type { DisassemblyLine } from "@/types/disassemblyline.interface";
import { type TraceEntry, unpackTraceEntries } from "@/virtualmachine/cpu/instructionTrace";

/** What the disassembly needs from the VM: its memory (debug reads) and the label scope of an address. */
export type TraceMemory = {
	readDebug: (address: number) => number | undefined;
	getScope: (address: number) => string;
};

/** A trace entry with its instruction: disassembled from memory as it is now, registers as they were before. */
export type DescribedTraceEntry = TraceEntry & { label?: string; instruction: string };

/** Disassembles the packed trace words (see `readInstructionTrace`), once per distinct address. */
export async function describeTraceEntries(vm: TraceMemory, words: Uint32Array): Promise<DescribedTraceEntry[]> {
	const lines = new Map<number, DisassemblyLine | undefined>();
	const entries: DescribedTraceEntry[] = [];
	for (const e of unpackTraceEntries(words)) {
		if (!lines.has(e.address)) {
			const [line] = await disassemble({
				readByte: (a) => vm.readDebug(a) ?? 0,
				scope: vm.getScope(e.address & 0xffff),
				fromAddress: e.address,
				lineCount: 1,
			});
			lines.set(e.address, line);
		}
		const line = lines.get(e.address);
		entries.push({
			...e,
			...(line?.label && { label: line.label }),
			instruction: line ? (line.opr ? `${line.opc} ${line.opr}` : line.opc) : "?",
		});
	}
	return entries;
}

const FLAG_NAMES = "NV-BDIZC";
/** P as flag letters, set ones upper case: `Nv-BdIzC`. */
export const formatFlags = (p: number) =>
	[...FLAG_NAMES].map((name, i) => (p & (0x80 >> i) ? name : name.toLowerCase())).join("");
