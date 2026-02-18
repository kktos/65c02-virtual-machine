import { ref } from "vue";

export type DataType = "code" | "byte" | "word" | "string";

export interface DataBlock {
	address: number;
	type: DataType;
	length: number;
}

// Global state for formatting rules
const formattingRules = ref<Map<number, DataBlock>>(new Map());

export function useFormatting() {
	const addFormat = (address: number, type: DataType, length: number) => {
		formattingRules.value.set(address, { address, type, length });
	};

	const removeFormat = (address: number) => {
		formattingRules.value.delete(address);
	};

	const getFormat = (address: number) => {
		return formattingRules.value.get(address);
	};

	const setFormatting = (rules: Record<string, DataBlock> | undefined) => {
		formattingRules.value.clear();
		if (!rules) return;
		for (const [key, value] of Object.entries(rules)) {
			formattingRules.value.set(Number(key), value);
		}
	};

	const getFormatting = () => {
		return Object.fromEntries(formattingRules.value);
	};

	const generateDataSymFileContent = (rules: Record<string, DataBlock>): string => {
		let content = `'%% DATA REGIONS %%':\n`;
		const sortedAddresses = Object.keys(rules)
			.map(Number)
			.sort((a, b) => a - b);
		for (const address of sortedAddresses) {
			const rule = rules[address] as DataBlock;
			const addressHex = address.toString(16).toUpperCase().padStart(4, "0");
			let len = rule.length;
			switch (rule?.type) {
				case "word":
					len = len / 2;
					break;
			}
			content += `  ${addressHex}: ${rule.type}[${len}]\n`;
		}
		return content;
	};

	return {
		formattingRules,
		addFormat,
		removeFormat,
		getFormat,
		setFormatting,
		getFormatting,
		generateDataSymFileContent,
	};
}
