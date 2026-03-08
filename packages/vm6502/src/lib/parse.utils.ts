import { useSymbols } from "@/composables/useSymbols";

export const parseValue = (valStr: string, max: number): number => {
	const isHex = valStr.startsWith("$");
	const cleanStr = isHex ? valStr.slice(1) : valStr;

	if (isHex && !/^[0-9A-Fa-f]+$/.test(cleanStr)) throw new Error(`Invalid hex format: ${valStr}`);
	if (!isHex && !/^\d+$/.test(cleanStr)) throw new Error(`Invalid number format: ${valStr}`);

	const value = Number.parseInt(cleanStr, isHex ? 16 : 10);
	if (Number.isNaN(value)) throw new Error(`Invalid value: ${valStr}`);
	if (value > max) throw new Error(`Value exceeds range (max $${max.toString(16).toUpperCase()})`);
	return value;
};

const { getAddressForLabel } = useSymbols();

export const parseAddress = (valStr: string): number => {
	const isHex = valStr.startsWith("$");
	if (isHex) return parseValue(valStr, 0xffff);

	const [ns, label] = valStr.split("::") as [string, string | undefined];
	const value = label ? getAddressForLabel(label, ns) : getAddressForLabel(ns);
	if (value === undefined) throw new Error(`Uknown label: ${valStr}`);

	return value;
};

export const parseRange = (valStr: string): { start: number; end: number } => {
	const separator = valStr.includes(":") ? ":" : valStr.includes("-") ? "-" : null;
	if (!separator) throw new Error("Invalid range format");

	const [startStr, endStr] = valStr.split(separator);
	if (!startStr || !endStr) throw new Error("Invalid range format");

	return { start: parseAddress(startStr.trim()), end: parseAddress(endStr.trim()) };
};
