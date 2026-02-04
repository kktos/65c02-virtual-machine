import { inject, type Ref } from "vue";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

export function useLabeling() {
	const vm = inject<Ref<VirtualMachine>>("vm");

	const getLabeledInstruction = (opcode: string) => {
		const labels = vm?.value?.machineConfig?.symbols;
		if (!labels) return { labeledOpcode: opcode, labelComment: null };

		const addressMatch = opcode.match(/\$([0-9A-Fa-f]{2,4}[\w,()]?)/);

		if (addressMatch) {
			const address = parseInt(addressMatch[1] ?? "", 16);

			const fullAddressExpression = addressMatch[0];
			const addressHexMatch = fullAddressExpression.match(/([0-9A-Fa-f]{2,4})/);

			if (addressHexMatch) {
				// const addressHex = addressHexMatch[1] as string;
				// const address = parseInt(addressHex, 16);

				if (labels[address]) {
					const label = labels[address];
					// Replace the address part with the label, keeping the addressing mode suffix
					const suffix = fullAddressExpression.substring(addressHexMatch[0].length + 1);
					const newOpcode = opcode.replace(fullAddressExpression, label + suffix);
					const comment = `$${address.toString(16).toUpperCase().padStart(4, "0")}`;
					return { labeledOpcode: newOpcode, labelComment: comment };
				}
			}
		}

		return { labeledOpcode: opcode, labelComment: null };
	};

	const loadSymbolsFromText = (text: string) => {
		const symbols: Record<number, string> = {};
		const lines = text.split(/\r?\n/);

		// Regex to match: LABEL: number = $XXXX
		// Captures: 1=Label, 2=HexAddress
		const regex = /^\s*([a-zA-Z0-9_]+)(?:\(\))?\s*:\s*number\s*=\s*\$([0-9A-Fa-f]+)/;

		for (const line of lines) {
			const match = line.match(regex) as [unknown, string, string] | null;
			if (match) {
				const label = match[1];
				const address = parseInt(match[2], 16);
				if (!Number.isNaN(address)) symbols[address] = label;
			}
		}
		vm?.value?.addSymbols(symbols);
	};

	const getLabelForAddress = (address: number) => {
		return vm?.value?.machineConfig?.symbols?.[address];
	};
	return { getLabeledInstruction, loadSymbolsFromText, getLabelForAddress };
}
