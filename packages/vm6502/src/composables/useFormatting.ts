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

	return {
		formattingRules,
		addFormat,
		removeFormat,
		getFormat,
	};
}
