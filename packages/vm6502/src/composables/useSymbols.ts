import { inject, type Ref } from "vue";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

export function useSymbols() {
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

				// Determine scope for the target address
				const scope = vm?.value?.getScope(address) ?? "main";
				if (labels[address]?.[scope]) {
					const label = labels[address][scope];
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

	const parseSymbolsFromText = (text: string) => {
		const symbols: Record<number, Record<string, string>> = {};
		const lines = text.split(/\r?\n/);
		let currentScope = "main";

		// Regex to match: LABEL: number = $XXXX
		// Captures: 1=Label, 2=HexAddress
		const symbolRegex = /^\s*([a-zA-Z0-9_]+)(?:\(\))?\s*:\s*number\s*=\s*\$([0-9A-Fa-f]+)/;

		// Regex to match header: LABEL [META]:
		// Captures: 1=Label, 2=Metadata content (optional)
		const headerRegex = /^\s*([a-zA-Z0-9_.]+)(?:\s*\[(.*)\])?\s*:/;

		for (const line of lines) {
			const symbolMatch = line.match(symbolRegex) as [unknown, string, string] | null;
			if (symbolMatch) {
				const label = symbolMatch[1];
				const address = parseInt(symbolMatch[2], 16);
				if (!Number.isNaN(address)) {
					if (!symbols[address]) symbols[address] = {};
					symbols[address][currentScope] = label;
				}
				continue;
			}

			const headerMatch = line.match(headerRegex);
			if (headerMatch) {
				const metadata = headerMatch[2];
				if (metadata) {
					const scopeMatch = metadata.match(/SCOPE\s*=\s*([a-zA-Z0-9_]+)/i) as [unknown, string] | null;
					currentScope = scopeMatch ? scopeMatch[1] : "main";
				} else {
					currentScope = "main";
				}
			}
		}
		return symbols;
	};

	const getLabelForAddress = (address: number, scope = "main") => {
		return vm?.value?.machineConfig?.symbols?.[address]?.[scope];
	};

	const getAddressForSymbol = (symbol: string): number | undefined => {
		const symbolMap = vm?.value?.machineConfig?.symbols;
		if (!symbolMap) return undefined;

		const upperSymbol = symbol.toUpperCase();

		// This is not performant for large symbol tables, but it's simple.
		// We can optimize this later by creating a reverse map if needed.
		for (const addressStr in symbolMap) {
			const address = parseInt(addressStr, 10);
			const scopes = symbolMap[address];
			if (scopes) {
				for (const scope in scopes) {
					if (scopes[scope].toUpperCase() === upperSymbol) {
						return address;
					}
				}
			}
		}

		return undefined;
	};

	return { getLabeledInstruction, parseSymbolsFromText, getLabelForAddress, getAddressForSymbol };
}
