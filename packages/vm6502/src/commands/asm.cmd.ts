import { assemble } from "@/lib/mini-assembler";
import { useSymbols } from "@/composables/useSymbols";
import type { Command, CommandResult } from "@/types/command";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

export const asmCmd: Command = {
	description: "Start mini-assembler at <address>",
	paramDef: ["address"],
	group: "Assembler",
	fn: (vm: VirtualMachine, _progress, params): CommandResult => {
		let currentAddr = (params[0] as number) & 0xffff;
		const { getAddressForLabel, addSymbol } = useSymbols();

		const parseExpression = (expr: string): number => {
			const e = expr.trim();
			if (e.startsWith("$")) return parseInt(e.substring(1), 16);
			if (/^-?\d+$/.test(e)) return parseInt(e, 10);
			const resolved = getAddressForLabel(e);
			return resolved !== undefined ? resolved : NaN;
		};

		const getPrompt = (addr: number) => `!${addr.toString(16).toUpperCase().padStart(4, "0")} `;

		return {
			__isMultiLineRequest: true,
			prompt: getPrompt(currentAddr),
			terminator: ".",
			onLine: (line: string) => {
				const trimmed = line.trim();
				if (!trimmed) return;
				if (trimmed.startsWith(";")) return; // Ignore comments

				const result = assemble(currentAddr, trimmed, {
					parseExpression,
					defineSymbol: (name, addr) => addSymbol(addr, name),
				});
				if (result.error) return { error: `Error: ${result.error}` };

				if (result.bytes.length > 0) {
					// Write bytes to VM
					for (let i = 0; i < result.bytes.length; i++)
						vm.writeDebug((currentAddr + i) & 0xffff, result.bytes[i] as number);

					const bytesHex = result.bytes.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
					const output = `${currentAddr.toString(16).toUpperCase().padStart(4, "0")}: ${bytesHex.padEnd(8)} ${trimmed}`;

					currentAddr = (currentAddr + result.bytes.length) & 0xffff;
					return { content: output, prompt: getPrompt(currentAddr) };
					// return { prompt: getPrompt(currentAddr) };
				}
			},
			onComplete: () => "Assembly finished.",
		};
	},
};
