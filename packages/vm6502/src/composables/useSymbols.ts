import { ref } from "vue";

export type SymbolDict = Record<number, Record<string, { label: string; source: string; scope: string }>>;

// Shared state for active namespaces across components
const activeNamespaces = ref<Map<string, boolean>>(new Map());
const symbolDict = ref<SymbolDict>({});

export function useSymbols() {
	const initSymbols = (newSymbols?: SymbolDict) => {
		symbolDict.value = newSymbols ?? {};
		activeNamespaces.value.clear();
		if (newSymbols) buildNamespacesFromSymbols(newSymbols);
	};

	const addSymbols = (newSymbols: SymbolDict) => {
		const symbols = symbolDict.value;
		for (const [addrStr, namespaces] of Object.entries(newSymbols)) {
			const addr = Number(addrStr);
			if (!symbols[addr]) symbols[addr] = {};
			Object.assign(symbols[addr], namespaces);
		}
		buildNamespacesFromSymbols(symbols);
	};

	const addSymbol = (address: number, label: string, namespace = "user", scope = "main") => {
		const symbols = symbolDict.value;

		if (!symbols[address]) symbols[address] = {};

		symbols[address][namespace] = { label, scope, source: "" };

		if (!activeNamespaces.value.has(namespace)) {
			activeNamespaces.value.set(namespace, true);
		}
	};

	const removeSymbol = (address: number, namespace = "user") => {
		const symbols = symbolDict.value;
		if (symbols[address]?.[namespace]) delete symbols[address][namespace];
	};

	const getUserSymbols = (): SymbolDict => {
		const allSymbols = symbolDict.value;

		const userSymbols: SymbolDict = {};

		for (const [addrStr, namespaces] of Object.entries(allSymbols)) {
			if (namespaces.user) {
				const addr = Number(addrStr);
				userSymbols[addr] = { user: namespaces.user };
			}
		}
		return userSymbols;
	};

	const clearUserSymbols = () => {
		const allSymbols = symbolDict.value;
		for (const namespaces of Object.values(allSymbols)) {
			if (namespaces.user) delete namespaces.user;
		}
	};

	const generateSymFileContent = (symbols: SymbolDict, namespace: string): string => {
		if (!symbols) return "";
		let content = `${namespace}:\n`;
		const sortedAddresses = Object.keys(symbols)
			.map(Number)
			.sort((a, b) => a - b);

		for (const address of sortedAddresses) {
			const nsData = symbols[address];
			if (nsData?.[namespace]) {
				const label = nsData[namespace].label;
				const addressHex = address.toString(16).toUpperCase().padStart(4, "0");
				content += `  ${label}: number = $${addressHex}\n`;
			}
		}
		return content;
	};

	const buildNamespacesFromSymbols = (symbols: SymbolDict) => {
		for (const namespaces of Object.values(symbols)) {
			Object.keys(namespaces).forEach((ns) => {
				if (!activeNamespaces.value.has(ns)) {
					activeNamespaces.value.set(ns, true);
				}
			});
		}
	};

	const resolveActiveNamespace = (address: number, scope = "main"): string | undefined => {
		const allSymbols = symbolDict.value;
		const map = allSymbols[address];
		if (!map) return undefined;

		// const currentMemoryScope = vm?.value?.getScope(address) ?? "main";

		// Look for an active namespace that has a symbol for this address AND matches the memory scope
		for (const [ns, isActive] of activeNamespaces.value) {
			if (!isActive) continue;
			const entry = map[ns];
			if (entry) {
				// Check if the symbol's scope matches the VM's current memory scope
				// We handle legacy entries that might not have a scope property by defaulting to 'main'
				const entryScope = entry.scope;
				if (entryScope === scope) return ns;
			}
		}
		return undefined;
	};

	const getLabeledInstruction = (opcode: string) => {
		const allSymbols = symbolDict.value;
		// if (!labels) return { labeledOpcode: opcode, labelComment: null };

		const addressMatch = opcode.match(/\$([0-9A-Fa-f]{2,4}[\w,()]?)/);

		if (addressMatch) {
			const address = parseInt(addressMatch[1] ?? "", 16);

			const fullAddressExpression = addressMatch[0];
			const addressHexMatch = fullAddressExpression.match(/([0-9A-Fa-f]{2,4})/);

			if (addressHexMatch) {
				// const addressHex = addressHexMatch[1] as string;
				// const address = parseInt(addressHex, 16);

				// Determine scope for the target address
				const ns = resolveActiveNamespace(address);
				if (ns && allSymbols[address]?.[ns]) {
					const entry = allSymbols[address][ns];
					const label = entry.label;
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
		const symbols: SymbolDict = {};
		const lines = text.split(/\r?\n/);
		let currentNamespace = "";
		let currentScope = "";

		// Regex to match: LABEL: number = $XXXX [; source]
		// Captures: 1=Label, 2=HexAddress, 3=Source (optional)
		const symbolRegex = /^\s*([a-zA-Z0-9_]+)(?:\(\))?\s*:\s*number\s*=\s*\$([0-9A-Fa-f]+)(?:\s*;\s*(.*))?/;

		// Regex to match header: LABEL [META]:
		// Captures: 1=Label, 2=Metadata content (optional)
		const headerRegex = /^('[^']+'|[a-zA-Z0-9_.]+)(?:\s*\[(.*)\])?\s*:/;

		for (const line of lines) {
			const symbolMatch = line.match(symbolRegex) as [unknown, string, string, string] | null;
			if (symbolMatch) {
				const label = symbolMatch[1];
				const address = parseInt(symbolMatch[2], 16);
				const source = symbolMatch[3];

				if (!Number.isNaN(address)) {
					if (!symbols[address]) symbols[address] = {};
					// Store by Namespace, but include the Scope in the entry
					symbols[address][currentNamespace] = { label, source, scope: currentScope };
				}
				continue;
			}

			const headerMatch = line.match(headerRegex) as [unknown, string, string] | null;
			if (headerMatch) {
				currentNamespace = headerMatch[1]; // The label is the namespace
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

	const getLabelForAddress = (address: number, scope?: string) => {
		const map = symbolDict.value[address];
		if (!map) return undefined;
		const nsList = Object.keys(map);
		for (const ns of nsList) {
			if (activeNamespaces.value.get(ns) && (!scope || map[ns]?.scope === scope || map[ns]?.scope === "main"))
				return map[ns]?.label;
		}
		console.warn("getLabelForAddress", address.toString(16).padStart(4, "0"), scope, map);
		return undefined;
	};

	const getSymbolForAddress = (address: number, scope?: string) => {
		const map = symbolDict.value[address];
		if (!map) return undefined;
		const nsList = Object.keys(map);
		for (const ns of nsList) {
			if (activeNamespaces.value.get(ns) && (!scope || map[ns]?.scope === scope || map[ns]?.scope === "main"))
				return map[ns];
		}
		console.warn("getSymbolForAddress", address.toString(16).padStart(4, "0"), scope, map);
		return undefined;
	};

	const getAddressForSymbol = (symbol: string): number | undefined => {
		const allSymbols = symbolDict.value;
		const upperSymbol = symbol.toUpperCase();

		// This is not performant for large symbol tables, but it's simple.
		// We can optimize this later by creating a reverse map if needed.
		for (const addressStr in allSymbols) {
			const address = parseInt(addressStr, 10);
			const namespaces = allSymbols[address];
			if (namespaces) {
				for (const ns in namespaces) {
					if (!activeNamespaces.value.get(ns)) continue;
					const entry = namespaces[ns];
					const label = entry?.label;
					if (label?.toUpperCase() === upperSymbol) return address;
				}
			}
		}

		return undefined;
	};

	const getNamespaceForAddress = (address: number) => resolveActiveNamespace(address);
	const getNamespaceList = () => Array.from(activeNamespaces.value.entries());

	const toggleNamespace = (ns: string) => {
		const isActive = activeNamespaces.value.get(ns) ?? false;
		activeNamespaces.value.set(ns, !isActive);
	};

	const searchSymbols = (query: string, limit = 20): { label: string; address: number; scope?: string }[] => {
		const symbolMap = symbolDict.value;
		if (!symbolMap || !query || query.trim().length === 0) return [];

		const upperQuery = query.trim().toUpperCase();
		const results: { label: string; address: number; scope?: string }[] = [];

		for (const addressStr in symbolMap) {
			const address = parseInt(addressStr, 10);
			const namespaces = symbolMap[address];
			if (!namespaces) continue;
			for (const ns in namespaces) {
				if (!activeNamespaces.value.get(ns)) continue;
				const entry = namespaces[ns];
				const label = entry?.label;
				const scope = entry?.scope;
				if (label?.toUpperCase().includes(upperQuery)) {
					results.push({ label, address, scope });
				}
			}
		}

		results.sort((a, b) => {
			const aUpper = a.label.toUpperCase();
			const bUpper = b.label.toUpperCase();

			if (aUpper === upperQuery) return -1;
			if (bUpper === upperQuery) return 1;

			const aStarts = aUpper.startsWith(upperQuery);
			const bStarts = bUpper.startsWith(upperQuery);

			if (aStarts && !bStarts) return -1;
			if (!aStarts && bStarts) return 1;

			return a.label.length - b.label.length;
		});

		return results.slice(0, limit);
	};

	return {
		initSymbols,
		getLabeledInstruction,
		parseSymbolsFromText,
		getLabelForAddress,
		getSymbolForAddress,
		getAddressForSymbol,
		getNamespaceForAddress,
		getNamespaceList,
		toggleNamespace,
		addSymbols,
		addSymbol,
		removeSymbol,
		getUserSymbols,
		clearUserSymbols,
		generateSymFileContent,
		buildNamespacesFromSymbols,
		searchSymbols,
		symbolDict,
	};
}
