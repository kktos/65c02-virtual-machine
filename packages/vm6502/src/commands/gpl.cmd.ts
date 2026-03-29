import { defineCommand } from "@/composables/useCommands";
import { useCrossReferences } from "@/composables/useCrossReferences";
import { useSymbols } from "@/composables/useSymbols";
import { formatAddress, toHex } from "@/lib/hex.utils";
import type { CommandContext } from "@/types/command";

export const gplCmd = defineCommand({
	description:
		"Generate Procedure Labels for a memory <\u200brange>.\n" +
		"Converts automatically generated labels (Lxxxx) to procedure labels (PROCxxxx) if they are targeted by JSR instructions.",
	paramDef: ["range"],
	group: "Symbols",
	fn: async ({ vm, progress, params }: CommandContext) => {
		const { start, end } = params[0] as { start: number; end: number };
		const { symbolsState, updateSymbol } = useSymbols();
		const { findReferences } = useCrossReferences();

		const candidates: any[] = [];
		const dicts = [symbolsState.value.dictA, symbolsState.value.dictB];

		// 1. Identify all candidate symbols in range matching the auto-label pattern
		for (const dict of dicts) {
			for (const addrStr in dict) {
				const addr = Number.parseInt(addrStr, 10);
				if (addr >= start && addr <= end) {
					const namespaces = dict[addr];
					if (!namespaces) continue;
					for (const ns in namespaces) {
						const sym = namespaces[ns];
						if (!sym || !sym.id) continue;

						// Check if it's an auto-generated label format: L + 4 hex digits
						const autoLabelPattern = /^L[0-9A-F]{4}$/i;
						if (autoLabelPattern.test(sym.label)) {
							// Sanity check: ensure the hex part matches the actual address
							if (sym.label.toUpperCase() === `L${toHex(sym.addr, 4)}`) candidates.push(sym);
						}
					}
				}
			}
		}

		if (candidates.length === 0)
			return `No candidate auto-generated labels found in range ${formatAddress(start)}-${formatAddress(end)}.`;

		let count = 0;
		for (let i = 0; i < candidates.length; i++) {
			const sym = candidates[i];
			progress.value = Math.floor((i / candidates.length) * 100);

			// 2. Search for references to this address
			const refs = findReferences(vm, sym.addr, "CALL");
			const isProcedure = refs.some((r) => r.type === "Call" && r.instruction.toUpperCase().startsWith("JSR"));

			if (isProcedure) {
				const newLabel = `PROC${toHex(sym.addr, 4)}`;
				await updateSymbol(sym.id, sym.addr, newLabel, sym.ns, sym.scope);
				count++;
			}
		}

		progress.value = 100;
		return `${count} labels promoted to procedures in range ${formatAddress(start)}-${formatAddress(end)}.`;
	},
});
